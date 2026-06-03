import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "../assets/logo.png";

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile drawer when location changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="logo" style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', background: 'transparent', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={logo} alt="Railyn Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.5)' }} />
            </div>
            <span style={{ fontFamily: 'var(--heading)', color: 'var(--text-main)', fontSize: '22px', letterSpacing: '-0.5px', fontWeight: '800' }}>Railyn</span>
          </Link>
        </div>

        <div className="nav-auth" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="desktop-auth" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <Link to="/about" className={isActive("/about") ? "active" : ""}>
              About Us
            </Link>
            <Link to="/contact" className={isActive("/contact") ? "active" : ""}>
              Contact Us
            </Link>
            <SignedIn>
              <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""}>
                My Bookings
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button type="button" className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: 'var(--radius-pill)', fontWeight: '700' }}>Login</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>

          {/* Mobile Menu Button */}
          <button 
            type="button" 
            className="mobile-menu-toggle" 
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Toggle Navigation Drawer"
          >
            {drawerOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Mobile Navigation Drawer */}
      <div className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', background: 'transparent', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={logo} alt="Railyn Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.5)' }} />
            </div>
            <span style={{ fontFamily: 'var(--heading)', color: 'var(--text-main)', fontSize: '22px', letterSpacing: '-0.5px', fontWeight: '800' }}>Railyn</span>
          </div>
          <button 
            type="button" 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}
            onClick={() => setDrawerOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <div className="drawer-links">
          <Link to="/about" className={isActive("/about") ? "active" : ""}>
            About Us
          </Link>
          <Link to="/contact" className={isActive("/contact") ? "active" : ""}>
            Contact Us
          </Link>
          <SignedIn>
            <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""}>
              My Bookings
            </Link>
          </SignedIn>
        </div>

        <div className="drawer-auth">
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary" style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-pill)', fontWeight: '700' }}>Login</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)' }}>Manage Account</span>
              <UserButton afterSignOutUrl="/" />
            </div>
          </SignedIn>
        </div>
      </div>
    </>
  );
};

export default Navbar;
