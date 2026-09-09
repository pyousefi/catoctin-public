import Link from "next/link";
import { Trees, ArrowUpRight, LogOut } from "lucide-react";
export function Header({ admin = false }: { admin?: boolean }) {
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span className="brand-icon">
          <Trees size={28} />
        </span>
        <span>
          Catoctin<span className="brand-sub">FAMILY & FRIENDS CAMP</span>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#memories">Our albums</Link>
        <Link className="nav-upload" href="/#share">
          Share photos <ArrowUpRight size={16} />
        </Link>
        {admin && <Link href="/admin">Admin</Link>}
        <form action="/api/auth/logout" method="post">
          <button
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={19} />
          </button>
        </form>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Trees size={22} />
        <span>A little place for our big camp family.</span>
      </div>
      <p>Made for the memories. See you next summer.</p>
      <Link href="/admin">Organizer sign-in</Link>
    </footer>
  );
}
