import { type NextAuthOptions, type DefaultSession, type Account, type Profile, type User } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { syncGitHubAchievementsForUser } from "@/lib/github-achievements";
import { supabaseAdmin } from "@/lib/supabase";

// --- Interfaces & Types ---

/**
 * Explicitly typed GitHub profile to replace implicit any access.
 */
interface GitHubProfile extends Profile {
  id: number;
  login: string;
  email?: string;
}

/**
 * Extend NextAuth modules to include our custom session/token properties.
 */
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
  // Gracefully handle Playwright testing environments by forcing non-secure cookies
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
    /**
     * signIn: Validates user identity and performs best-effort DB synchronization.
     * Uses explicit type assertions and defensive checks for Supabase connectivity.
     */
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

          // Resilience: handle schema-mismatched errors (42703) during migrations
          if (upsertError && upsertError.code === "42703") {
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
              userId: user.id as string,
              githubLogin: githubProfile.login,
              token: account.access_token,
              force: true,
            }).catch((err: unknown) => console.error("[auth] Sync failed:", err));
          }
        } catch (error) {
          console.error("[auth] Non-fatal signIn callback error:", error);
        }
      }
      return true;
    },

    /**
     * jwt: Handles persistent token management and liveness verification.
     */
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
        token.githubLogin = (user as { login?: string }).login ?? "mock-user";
      }

      // Perform periodic liveness checks for token revocation
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
          // Failure to reach GitHub does not invalidate session; retry on next hit
        }
      }

      return token;
    },

    /**
     * session: Exposes validated token/profile data to the client.
     */
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
