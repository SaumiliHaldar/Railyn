import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, ChevronDown } from "lucide-react";
import { FaEnvelope, FaMapMarkerAlt, FaPhoneAlt } from "react-icons/fa";
import railynHero from "../assets/railyn_hero.png";

interface FAQ {
  question: string;
  answer: string;
}

const Contact = () => {
  // Form state
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false,
    message: "",
    type: "success"
  });

  // FAQ state
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const faqs: FAQ[] = [
    {
      question: "How does the Tatkal Concurrency Simulator work?",
      answer: "Simulates high-volume concurrent booking streams to demonstrate database transaction locking safety and prevent oversell issues."
    },
    {
      question: "What is a PNR status query?",
      answer: "Fetches the live status of your booking. Enter your 10-digit number on the home search widget to pull current trip details."
    },
    {
      question: "Can I cancel a ticket after chart preparation?",
      answer: "No. Cancellations are only permitted online before chart preparation. Afterward, refunds are subject to standard TDR rules."
    },
    {
      question: "How does the Delay Engine function?",
      answer: "Monitors active train routes automatically and dynamically updates dynamic timetables and vacancy listings."
    }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({ name: "", email: "", subject: "", message: "" });
        setToast({
          show: true,
          message: "Message sent successfully! We will get back to you shortly.",
          type: "success"
        });
        setTimeout(() => {
          setToast(prev => ({ ...prev, show: false }));
        }, 4000);
      } else {
        const errData = await response.json();
        setToast({
          show: true,
          message: errData.detail || "Failed to send message. Please try again later.",
          type: "error"
        });
        setTimeout(() => {
          setToast(prev => ({ ...prev, show: false }));
        }, 4000);
      }
    } catch (error) {
      console.error("Error submitting contact form:", error);
      setToast({
        show: true,
        message: "Something went wrong. Please check your internet connection.",
        type: "error"
      });
      setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFaq = (idx: number) => {
    setActiveFaq(prev => (prev === idx ? null : idx));
  };

  return (
    <div className="contact-page">
      {/* Hero Header — image behind, matching About page pattern */}
      <section className="contact-hero" style={{ position: "relative", overflow: "hidden" }}>
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
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
          >
            Contact Us
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{ color: "#1e293b" }}
          >
            Get in touch with our team for operational support or reservation assistance.
          </motion.p>
        </div>
      </section>

      {/* Main Grid Content */}
      <section className="contact-content-grid">
        {/* Support Details (Left) */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 80 }}
          className="contact-info-panel"
        >
          <div className="info-header">
            <h2>Support Directory</h2>
            <p>Reach us through our official support channels.</p>
          </div>

          <div className="info-cards-list">
            <div className="contact-card">
              <div className="contact-card-icon">
                <FaPhoneAlt />
              </div>
              <div className="contact-card-details">
                <h4>Customer Helpline</h4>
                <p>139 (Toll-Free, 24/7 National Hotline)</p>
                <p>Office: +91 11-4040-0139</p>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-card-icon">
                <FaEnvelope />
              </div>
              <div className="contact-card-details">
                <h4>Support Email</h4>
                <p>haldar.saumili843@gmail.com</p>
                <p>Expect a response within 2 hours</p>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-card-icon">
                <FaMapMarkerAlt />
              </div>
              <div className="contact-card-details">
                <h4>Headquarters</h4>
                <p>12, Salt Lake Sector V,</p>
                <p>Kolkata, 700091, India</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Contact Form Container (Right) */}
        <motion.div
          initial={{ x: 30, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 80 }}
          className="contact-form-panel"
        >
          <h3 className="form-title">Send a Message</h3>
          <form onSubmit={handleFormSubmit} className="contact-form-grid">
            <div className="contact-form-row">
              <div className="form-group">
                <label htmlFor="form-name">Name</label>
                <input
                  id="form-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Your Name"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="form-email">Email Address</label>
                <input
                  id="form-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Your Email"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="form-subject">Subject</label>
              <input
                id="form-subject"
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
                placeholder="Inquiry subject"
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="form-message">Message</label>
              <textarea
                id="form-message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                placeholder="Enter your message details..."
                required
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting || !formData.name || !formData.email || !formData.message}
            >
              {isSubmitting ? (
                <>
                  <div className="search-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderTopColor: '#fff', borderRightColor: '#fff' }} />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Submit Message</span>
              )}
            </button>
          </form>
        </motion.div>
      </section>

      {/* Accordion FAQ Section */}
      <section className="faq-section">
        <div className="section-header">
          <h2>Frequently Asked Questions</h2>
          <p>Common questions regarding Railyn services.</p>
        </div>

        <div className="faq-list">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div key={idx} className={`faq-item ${isOpen ? "active" : ""}`}>
                <button
                  type="button"
                  className="faq-trigger"
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={isOpen}
                >
                  <h4>{faq.question}</h4>
                  <div className="faq-icon-wrapper">
                    <ChevronDown size={20} />
                  </div>
                </button>
                <div 
                  className="faq-content" 
                  style={{ maxHeight: isOpen ? "150px" : "0" }}
                >
                  <div className="faq-content-inner">
                    <p>{faq.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Floating Glassmorphic Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`premium-toast ${toast.type}`}
          >
            <div className="premium-toast-icon">
              {toast.type === "success" ? (
                <CheckCircle size={20} />
              ) : (
                <AlertCircle size={20} style={{ color: "#ef4444" }} />
              )}
            </div>
            <div className="premium-toast-content">
              {toast.message}
            </div>
            <button
              className="premium-toast-close"
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Contact;
