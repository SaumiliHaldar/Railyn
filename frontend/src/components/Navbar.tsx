import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Train } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="logo" style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Train size={32} color="#1E6F2B" />
          <span style={{ fontFamily: 'var(--heading)', color: 'white' }}>Railyn</span>
        </a>
      </div>
      
      <div className="nav-auth">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn btn-primary">Login</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="/dashboard" style={{ color: 'white', textDecoration: 'none', fontSize: '14px', fontWeight: '600', opacity: 0.8 }}>My Bookings</a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
