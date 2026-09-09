import { SiteVersion } from "@/components/site-version";
import Link from "next/link";
import { Trees } from "lucide-react";
import { CampScene } from "@/components/camp-scene";
import { LoginForm } from "@/components/login-form";
import { configured } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string }>;
}) {
  const admin = (await searchParams).admin === "1";
  return (
    <main className="login-page">
      <div className="login-brand">
        <Trees size={30} />
        <span>
          Catoctin <small>FAMILY & FRIENDS CAMP</small>
        </span>
      </div>
      <div className="login-card">
        <div className="login-art">
          <CampScene />
          <div className="login-art-caption">
            <span className="eyebrow">OUR FAVORITE PLACE TOGETHER</span>
            <h2>
              Same woods.
              <br /> New memories.
            </h2>
            <p>Catoctin Mountain Park · Maryland</p>
          </div>
        </div>
        <div className="login-content">
          <span className="eyebrow">YOU’RE PART OF THE FAMILY</span>
          <h1>{admin ? "Hello, organizer." : "Welcome back, campers."}</h1>
          <p className="intro">
            {admin
              ? "Gather the photos, keep things organized, and help our memories find their way home."
              : "The tents are packed, but the memories are staying. Come in, look around, and share a few of your own."}
          </p>
          <LoginForm admin={admin} ready={configured()} />
          <Link
            className="text-link login-switch"
            href={admin ? "/login" : "/login?admin=1"}
          >
            {admin
              ? "← Back to family sign-in"
              : "Camp organizer? Sign in here"}
          </Link>
        </div>
      </div>
      <p className="login-bottom">Labor Day weekends. Lifelong memories.</p>
      <div className="login-version">
        <SiteVersion />
      </div>
    </main>
  );
}
