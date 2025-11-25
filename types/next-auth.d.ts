import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username?: string;
      wikimediaId?: string;
    } & DefaultSession["user"];
    accessToken?: string;
  }

  interface Profile {
    sub: string;
    username: string;
    email?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    wikimediaId?: string;
    username?: string;
    accessToken?: string;
  }
}
