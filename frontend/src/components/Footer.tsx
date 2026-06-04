import { SignedIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { FaGithub, FaLinkedin, FaMapMarkerAlt, FaPhoneAlt, FaEnvelope } from "react-icons/fa";
import logo from "../assets/logo.png";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        {/* Brand Column */}
        <div className="footer-col">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "44px", height: "44px", background: "transparent", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <img src={logo} alt="Railyn Logo" style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.5)" }} />
            </div>
            <span style={{ fontFamily: "var(--heading)", color: "#ffffff", fontSize: "24px", letterSpacing: "-0.5px", fontWeight: "900" }}>Railyn</span>
          </div>
          <p className="footer-brand-desc">
            Next-generation train booking experience designed for safety, speed, and punctuality.
          </p>
          <div className="footer-socials">
            <a href="https://github.com/SaumiliHaldar" target="_blank" rel="noopener noreferrer" className="social-pill" aria-label="GitHub">
              <FaGithub size={18} />
            </a>
            <a href="https://www.linkedin.com/in/saumili-haldar-0804s2003" target="_blank" rel="noopener noreferrer" className="social-pill" aria-label="LinkedIn">
              <FaLinkedin size={18} />
            </a>
          </div>
        </div>

        {/* Quick Links Column */}
        <div className="footer-col">
          <h3 className="footer-col-title">Navigation</h3>
          <ul className="footer-links-list">
            <li>
              <Link to="/about">About Us</Link>
            </li>
            <li>
              <Link to="/contact">Contact Support</Link>
            </li>
            <SignedIn>
              <li>
                <Link to="/dashboard">My Bookings</Link>
              </li>
            </SignedIn>
            <li>
              <a href="https://www.irctc.co.in" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                IRCTC Official ↗
              </a>
            </li>
          </ul>
        </div>

        {/* Features Column */}
        <div className="footer-col">
          <h3 className="footer-col-title">Features</h3>
          <ul className="footer-links-list">
            <li>
              <Link to="/">Ticket Booking</Link>
            </li>
            <li>
              <Link to="/pnr">PNR Status Inquiry</Link>
            </li>
            <li>
              <Link to="/charts">Vacancy Charts</Link>
            </li>
            <li>
              <span style={{ color: "#cbd5e1", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                Tatkal Concurrency
              </span>
            </li>
          </ul>
        </div>

        {/* Support Column */}
        <div className="footer-col">
          <h3 className="footer-col-title">Helpline Info</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="footer-contact-item" style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div className="footer-icon-wrapper" style={{ width: "24px", display: "flex", justifyContent: "center", color: "var(--accent)", fontSize: "16px", paddingTop: "4px", flexShrink: 0 }}>
                <FaMapMarkerAlt />
              </div>
              <span style={{ fontSize: "14px", lineHeight: "1.6", opacity: 0.85 }}>
                Railyn Travel Technologies,<br />
                12, Salt Lake Sector V,<br />
                Kolkata, 700091, India
              </span>
            </div>
            <div className="footer-contact-item" style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div className="footer-icon-wrapper" style={{ width: "24px", display: "flex", justifyContent: "center", color: "var(--accent)", fontSize: "16px", paddingTop: "4px", flexShrink: 0 }}>
                <FaPhoneAlt />
              </div>
              <span style={{ fontSize: "14px", lineHeight: "1.6", opacity: 0.85 }}>
                Customer Care: 139<br />
                Support: +91 11-4040-0139
              </span>
            </div>
            <div className="footer-contact-item" style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div className="footer-icon-wrapper" style={{ width: "24px", display: "flex", justifyContent: "center", color: "var(--accent)", fontSize: "16px", paddingTop: "4px", flexShrink: 0 }}>
                <FaEnvelope />
              </div>
              <span style={{ fontSize: "14px", lineHeight: "1.6", opacity: 0.85 }}>
                <a href="mailto:haldar.saumili843@gmail.com" style={{ color: "inherit", textDecoration: "none", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--accent)"} onMouseOut={(e) => e.currentTarget.style.color = "inherit"}>
                  haldar.saumili843@gmail.com
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Copyright Section */}
      <div className="footer-bottom">
        <div>
          © {currentYear} Railyn. All Rights Reserved.
        </div>
        <div className="footer-bottom-links">
          <a href="#privacy">Privacy Policy</a>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>•</span>
          <a href="#terms">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
