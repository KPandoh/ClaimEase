import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <PageHeader
        title="Sign in"
        description="Use your ClaimEase account to access authorized services."
      />
      <Card className="p-6">
        <LoginForm />
      </Card>
    </section>
  );
}
