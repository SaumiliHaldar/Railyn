import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Train } from "lucide-react";
import { useState, useEffect } from "react";

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="logo" style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'white', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <Train size={28} color="var(--primary)" />
          </div>
          <span style={{ fontFamily: 'var(--heading)', color: 'var(--text-main)', fontSize: '22px', letterSpacing: '-0.5px', fontWeight: '800' }}>Railyn</span>
        </a>
      </div>
      
      <div className="nav-auth">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: 'var(--radius-pill)', fontWeight: '700' }}>Login</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <a href="/dashboard" style={{ color: 'var(--text-main)', textDecoration: 'none', fontSize: '14px', fontWeight: '700', opacity: 0.7 }}>Trips</a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
