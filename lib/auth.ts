import { NextAuthOptions } from "next-auth";
import WikimediaProvider from "next-auth/providers/wikimedia";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const authOptions: NextAuthOptions = {
  providers: [
    WikimediaProvider({
      clientId: process.env.AUTH_WIKIMEDIA_ID!,
      clientSecret: process.env.AUTH_WIKIMEDIA_SECRET!,
      // Wikimedia requires a User-Agent header
      httpOptions: {
        headers: {
          "User-Agent": "KOWiz/1.0 (https://app.kowiz.tsensei.dev; contact@example.com)",
        },
      },
      // Optional: You can add profile callback to customize the user data
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.username,
          email: profile.email,
          image: null, // Wikimedia doesn't provide profile images by default
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and user info to the token right after signin
      if (account && profile && profile.sub) {
        token.accessToken = account.access_token;
        token.username = (profile as any).username;
        token.wikimediaId = profile.sub;

        // Find or create user in database
        const wikimediaId: string = profile.sub;
        const username: string = (profile as any).username || "";
        const email: string | null = profile.email ?? null;
        const name: string | null = (profile as any).name || username || null;

        // Check if user exists
        const existingUsers = await db
          .select()
          .from(users)
          .where(eq(users.wikimediaId, wikimediaId));

        if (existingUsers.length > 0) {
          // Update existing user
          const [updatedUser] = await db
            .update(users)
            .set({
              username,
              email: email,
              name: name,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.wikimediaId, wikimediaId))
            .returning();
          token.userId = updatedUser.id;
        } else {
          // Create new user
          const [newUser] = await db
            .insert(users)
            .values({
              wikimediaId,
              username,
              email: email,
              name: name,
            })
            .returning();
          token.userId = newUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      if (session.user && token.userId) {
        // Extend session user with custom fields
        session.user = {
          ...session.user,
          id: token.userId as string,
          username: token.username as string,
          wikimediaId: token.wikimediaId as string,
        };
      }
      // Add access token to session
      if (token.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
    async signIn({ account, profile }) {
      // Check if user has an email (optional - Wikimedia accounts may not have email)
      // Uncomment the following lines if you want to require email
      // if (!profile?.email) {
      //   return false;
      // }
      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: process.env.AUTH_SECRET,
};
