import { motion } from "framer-motion";
import railynHero from "../assets/railyn_hero.png";

const About = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 120,
        damping: 18
      }
    }
  };

  return (
    <div className="about-page">
      {/* Hero Header */}
      <section className="about-hero" style={{ position: "relative", overflow: "hidden" }}>
        {/* Background image */}
        <motion.img
          src={railynHero}
          alt=""
          aria-hidden="true"
          initial={{ scale: 1.06, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            zIndex: 0,
            pointerEvents: "none",
            userSelect: "none"
          }}
        />
        {/* Gradient overlay so text stays readable */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(240,247,241,0.62) 100%)",
          zIndex: 1,
          pointerEvents: "none"
        }} />
        {/* Content sits above the image */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <motion.h1
            initial={{ y: -15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
          >
            Redefining Train Reservations
          </motion.h1>
          <motion.p
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{ color: "#1e293b" }}
          >
            A high-performance booking platform designed for speed, security, and live trip tracking.
          </motion.p>
        </div>
      </section>

      {/* Pillars Section */}
      <section className="about-section">
        <div className="section-header">
          <h2>Our Core Focus</h2>
          <p>Safety, Security, and Punctuality drive our operational philosophy.</p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="pillar-grid"
        >
          {/* Safety Pillar */}
          <motion.div variants={itemVariants} className="pillar-card">
            <div className="pillar-icon-wrapper" style={{ fontFamily: "var(--heading)", fontWeight: 900, fontSize: "24px" }}>
              01
            </div>
            <h3>Safety</h3>
            <p>
              Fail-safe seat booking integrity to prevent overlapping reservations even under peak concurrent loads.
            </p>
          </motion.div>

          {/* Security Pillar */}
          <motion.div variants={itemVariants} className="pillar-card">
            <div className="pillar-icon-wrapper" style={{ fontFamily: "var(--heading)", fontWeight: 900, fontSize: "24px" }}>
              02
            </div>
            <h3>Security</h3>
            <p>
              End-to-end data encryption and protected API gateways to ensure complete user privacy.
            </p>
          </motion.div>

          {/* Punctuality Pillar */}
          <motion.div variants={itemVariants} className="pillar-card">
            <div className="pillar-icon-wrapper" style={{ fontFamily: "var(--heading)", fontWeight: 900, fontSize: "24px" }}>
              03
            </div>
            <h3>Punctuality</h3>
            <p>
              Precision trip telemetry providing live route updates and accurate schedule changes.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* Advanced Technology Section */}
      <section className="about-section about-section-dark">
        <div className="features-showcase-grid">
          <motion.div 
            initial={{ x: -30, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80 }}
            className="showcase-content"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="about-hero-badge" style={{ alignSelf: 'flex-start' }}>Architecture</span>
              <h2 style={{ fontFamily: "var(--heading)", fontSize: "32px", fontWeight: 800, color: "var(--text-main)", letterSpacing: "-0.5px" }}>
                Built to Scale
              </h2>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "15px", lineHeight: 1.6 }}>
              Our modern distributed architecture eliminates typical bottlenecks during high-demand booking hours.
            </p>

            <div className="showcase-item">
              <span className="showcase-num">01</span>
              <div className="showcase-details">
                <h4>Tatkal Simulation</h4>
                <p>Simulates high-concurrency ticket reservations without database lock issues.</p>
              </div>
            </div>

            <div className="showcase-item">
              <span className="showcase-num">02</span>
              <div className="showcase-details">
                <h4>Vacancy Matrix</h4>
                <p>Visual, real-time coach structures for instant seat mapping and selections.</p>
              </div>
            </div>

            <div className="showcase-item">
              <span className="showcase-num">03</span>
              <div className="showcase-details">
                <h4>Self-Healing Engine</h4>
                <p>Monitors route telemetry and dynamically adjusts active train listings.</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ x: 30, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 80 }}
            className="showcase-visual"
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', zIndex: 10 }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--heading)", fontWeight: 900, fontSize: "28px", color: "var(--primary)" }}>
                R
              </div>
              <span style={{ fontFamily: 'var(--heading)', fontWeight: '800', fontSize: '18px', color: 'var(--primary)' }}>Distributed Core</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ padding: '6px 12px', background: '#ffffff', borderRadius: '20px', fontSize: '11px', fontWeight: '700', border: '1px solid rgba(0,0,0,0.05)' }}>Redis Cache</span>
                <span style={{ padding: '6px 12px', background: '#ffffff', borderRadius: '20px', fontSize: '11px', fontWeight: '700', border: '1px solid rgba(0,0,0,0.05)' }}>WAL Ledger</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Counter Strip */}
      <section className="about-section">
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 60 }}
          className="stats-container"
        >
          <div className="stat-box">
            <div className="stat-val">10M+</div>
            <div className="stat-lbl">Bookings</div>
          </div>
          <div className="stat-box">
            <div className="stat-val">&lt; 2ms</div>
            <div className="stat-lbl">Latency</div>
          </div>
          <div className="stat-box">
            <div className="stat-val">99.99%</div>
            <div className="stat-lbl">Uptime</div>
          </div>
          <div className="stat-box">
            <div className="stat-val">250+</div>
            <div className="stat-lbl">Active Trains</div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default About;
