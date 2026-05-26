import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

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
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', background: 'transparent', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={logo} alt="Railyn Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.5)' }} />
          </div>
          <span style={{ fontFamily: 'var(--heading)', color: 'var(--text-main)', fontSize: '22px', letterSpacing: '-0.5px', fontWeight: '800' }}>Railyn</span>
        </Link>
      </div>
      
      <div className="nav-auth">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: 'var(--radius-pill)', fontWeight: '700' }}>Login</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <Link to="/dashboard" style={{ color: 'var(--text-main)', textDecoration: 'none', fontSize: '14px', fontWeight: '700', opacity: 0.7 }}>Bookings</Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
