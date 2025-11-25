"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Sign in to KOWiz using your Wikimedia account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn("wikimedia", { callbackUrl: "/" })}
            className="w-full"
          >
            Sign in with Wikimedia
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
