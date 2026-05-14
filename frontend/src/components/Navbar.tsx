import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Train } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="logo" style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Train size={28} color="var(--primary)" />
          </div>
          <span style={{ fontFamily: 'var(--heading)', color: 'var(--primary)', fontSize: '22px', letterSpacing: '-0.5px', fontWeight: '800' }}>Railyn</span>
        </a>
      </div>
      
      <div className="nav-auth">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn btn-primary">Login</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <a href="/dashboard" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: '700' }}>My Bookings</a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
