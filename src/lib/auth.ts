import { type NextAuthOptions, type DefaultSession, type Account, type Profile, type User } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { syncGitHubAchievementsForUser } from "@/lib/github-achievements";
import { supabaseAdmin } from "@/lib/supabase";

// --- Interfaces & Types ---

interface GitHubProfile extends Profile {
  id: number;
  login: string;
  email?: string;
}

declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
    githubId?: string;
    githubLogin?: string;
    error?: "TokenRevoked";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenValidatedAt?: number;
    githubId?: string;
    githubLogin?: string;
    error?: "TokenRevoked";
  }
}

// --- Configuration ---

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const SESSION_UPDATE_AGE = 24 * 60 * 60;
const TOKEN_VALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const GITHUB_API = "https://api.github.com";
const isPlaywrightServer = process.env.PLAYWRIGHT_SERVER_MODE === "start";

export const authOptions: NextAuthOptions = {
  ...(isPlaywrightServer ? { useSecureCookies: false } : {}),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      authorization: {
        params: { scope: "read:user user:email repo read:discussion read:org" },
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
    updateAge: SESSION_UPDATE_AGE,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE,
  },
  callbacks: {
    async signIn({ account, profile }): Promise<boolean> {
      if (account?.provider === "github" && profile) {
        const githubProfile = profile as GitHubProfile;

        if (!supabaseAdmin) {
          console.warn("[auth] supabaseAdmin not configured; skipping DB upsert.");
          return true;
        }

        try {
          const { data: user, error: upsertError } = await supabaseAdmin
            .from("users")
            .upsert(
              {
                github_id: String(githubProfile.id),
                github_login: githubProfile.login,
                email: githubProfile.email ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "github_id" }
            )
            .select("id")
            .single();

          if (upsertError && upsertError.code === "42703") {
            // Fallback for pending migrations
            await supabaseAdmin.from("users").upsert({
              github_id: String(githubProfile.id),
              github_login: githubProfile.login,
              updated_at: new Date().toISOString(),
            }, { onConflict: "github_id" });
          } else if (upsertError) {
            console.error("[auth] Supabase upsert error:", upsertError);
          }

          if (user?.id && account.access_token) {
            await syncGitHubAchievementsForUser({
              userId: user.id,
              githubLogin: githubProfile.login,
              token: account.access_token,
              force: true,
            }).catch((err) => console.error("[auth] Sync failed:", err));
          }
        } catch (error) {
          console.error("[auth] Non-fatal signIn callback error:", error);
        }
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.accessTokenValidatedAt = Date.now();
      }

      if (profile) {
        const p = profile as GitHubProfile;
        token.githubId = String(p.id);
        token.githubLogin = p.login;
      } else if (user && !token.githubId) {
        token.githubId = user.id;
        token.githubLogin = (user as any).login ?? "mock-user";
      }

      if (
        !account &&
        token.accessToken &&
        typeof token.accessTokenValidatedAt === "number" &&
        !token.error &&
        Date.now() - token.accessTokenValidatedAt > TOKEN_VALIDATION_INTERVAL_MS
      ) {
        try {
          const res = await fetch(`${GITHUB_API}/user`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
            cache: "no-store",
          });
          if (res.status === 401) {
            token.error = "TokenRevoked";
          } else if (res.ok) {
            token.accessTokenValidatedAt = Date.now();
          }
        } catch {
          // Silent catch: retry on next request
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.githubId = token.githubId;
      session.githubLogin = token.githubLogin;
      session.error = token.error;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
