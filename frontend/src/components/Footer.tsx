import { useState } from "react";
import { Link } from "react-router-dom";
import { FaGithub, FaLinkedin, FaMapMarkerAlt, FaPhoneAlt, FaEnvelope } from "react-icons/fa";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../assets/logo.png";

const policies = {
  privacy: {
    title: "Privacy Policy",
    content: (
      <>
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>1. Information We Collect</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>At Railyn Travel Technologies ("Railyn", "We", "Us", "Our"), we recognize the importance of your privacy. We collect personal identification information, including but not limited to, your full name, age, gender, contact number, and email address. This information is collected solely for the explicit purpose of facilitating railway ticket bookings, verifying passenger identities as mandated by the Ministry of Railways, and ensuring a seamless travel experience.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>2. How We Use and Share Your Data</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>The data collected is utilized to process financial transactions, generate Electronic Reservation Slips (ERS), and provide critical journey-related updates (such as PNR status changes or schedule alterations). We may share your passenger manifest details strictly with the Indian Railway Catering and Tourism Corporation (IRCTC) and authorized railway personnel. We categorically do not sell, rent, or lease your personal data to third-party marketing or advertising entities.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>3. Payment Gateway and Security</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>To ensure the highest standard of security, all payment authorizations and gateway interactions are securely routed through our partner, Razorpay. Railyn does not capture, store, or process your sensitive credit card numbers, debit card details, or internet banking credentials on our internal servers.</p>

        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>4. Cookies and Telemetry</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Our platform employs standard session cookies and localized storage mechanisms to maintain your authenticated state and save passenger preferences. Additionally, we collect anonymized telemetry data to monitor system performance, identify latency bottlenecks, and improve the overall booking interface.</p>
      </>
    )
  },
  terms: {
    title: "Terms of Service",
    content: (
      <>
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>1. Acceptance of Terms</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Welcome to Railyn. By accessing, browsing, or utilizing our web platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. Railyn acts strictly as an authorized B2C technological intermediary for railway reservations.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>2. User Responsibilities and Authentication</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>It is the sole responsibility of the user to provide accurate and verifiable passenger details. The name and age entered during the booking process must exactly match a valid government-issued photographic identification (e.g., Aadhaar, PAN, Voter ID). Tickets booked via Railyn are strictly non-transferable under Section 142 of the Railways Act.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>3. Service Availability and Tatkal Quota</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>While we strive to provide 99.9% uptime, the availability of specific trains, seat inventory, and Tatkal quota tickets are entirely subject to the central railway database. We do not guarantee the confirmation of waitlisted (WL) or Reservation Against Cancellation (RAC) tickets.</p>

        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>4. Limitation of Liability</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Railyn, its affiliates, and its employees shall not be held liable for any direct, indirect, incidental, or consequential damages arising from train delays, abrupt cancellations, route diversions, or schedule changes executed by the railway authorities.</p>
      </>
    )
  },
  refund: {
    title: "Refund & Cancellation Policy",
    content: (
      <>
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>1. Standard Cancellation Window</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Passengers may initiate ticket cancellations directly through the Railyn dashboard. Confirmed tickets must be cancelled up to 4 hours prior to the scheduled departure of the train, or before the final chart preparation, whichever is earlier, to be eligible for a refund.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>2. Clerkage and Cancellation Fees</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Refund calculations are strictly governed by the standard railway cancellation rules. A baseline clerkage fee is deducted from the base fare, scaling progressively depending on the class of travel (e.g., higher deductions for 1AC/2AC compared to Sleeper class) and the proximity of the cancellation to the departure time.</p>
        
        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>3. Railyn 'Free Cancellation' Guarantee</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>If the user explicitly opted into the 'Free Cancellation' feature during the initial checkout (by paying a nominal, non-refundable per-passenger premium), Railyn guarantees a 100% refund of the base ticket fare, waiving all standard railway clerkage and cancellation penalties.</p>

        <h4 style={{ fontWeight: 700, marginTop: "16px", marginBottom: "8px", color: "var(--text-main)" }}>4. Refund Processing Timeline</h4>
        <p style={{ marginBottom: "12px", color: "var(--text-muted)", lineHeight: "1.6" }}>Approved refunds are systematically routed back to the original payment instrument (Credit Card, UPI, or NetBanking) used during the transaction. Please allow a standard processing window of 5 to 7 business days for the credit to reflect in your account statement.</p>
      </>
    )
  }
};

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [activePolicy, setActivePolicy] = useState<keyof typeof policies | null>(null);

  return (
    <>
      <footer className="site-footer">
        <div className="footer-grid">
          {/* Brand Column */}
          <div className="footer-col">
            <Link to="/" onClick={() => window.scrollTo(0, 0)} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", textDecoration: "none" }}>
              <div style={{ width: "44px", height: "44px", background: "transparent", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={logo} alt="Railyn Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
              <span style={{ fontFamily: "var(--heading)", color: "#ffffff", fontSize: "24px", letterSpacing: "-0.5px", fontWeight: "900" }}>Railyn</span>
            </Link>
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
                <Link to="/contact">Contact Us</Link>
              </li>
              <li>
                <Link to="/dashboard">My Bookings</Link>
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
            <button onClick={() => setActivePolicy("privacy")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "14px", padding: 0 }}>Privacy Policy</button>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>•</span>
            <button onClick={() => setActivePolicy("terms")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "14px", padding: 0 }}>Terms of Service</button>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>•</span>
            <button onClick={() => setActivePolicy("refund")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "14px", padding: 0 }}>Refund Policy</button>
          </div>
        </div>
      </footer>

      {/* Policy Modal */}
      <AnimatePresence>
        {activePolicy && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setActivePolicy(null)}>
            <motion.div 
              initial={{ opacity: 0, y: 30 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 30 }} 
              onClick={e => e.stopPropagation()} 
              style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}
            >
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                  {policies[activePolicy].title}
                </h2>
                <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "#e2e8f0"} onMouseOut={e => e.currentTarget.style.background = "transparent"} onClick={() => setActivePolicy(null)}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: "24px", overflowY: "auto", flex: 1, color: "var(--text-main)" }}>
                {policies[activePolicy].content}
              </div>
              <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", background: "white", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setActivePolicy(null)} style={{ background: "var(--primary)", color: "white", border: "none", padding: "10px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s" }} onMouseOver={e => e.currentTarget.style.opacity = "0.9"} onMouseOut={e => e.currentTarget.style.opacity = "1"}>
                  Acknowledge & Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Footer;
