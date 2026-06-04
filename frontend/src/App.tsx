import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// Lazy load pages for better performance and smaller bundle sizes
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Trains = lazy(() => import("./pages/Trains"));
const PnrStatus = lazy(() => import("./pages/PnrStatus"));
const VacancyCharts = lazy(() => import("./pages/VacancyCharts"));

// Scroll to top restoration on route change
function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // If navigating to Home page with a tab query parameter, let Home handle scroll
    const params = new URLSearchParams(search);
    if (pathname === "/" && params.has("tab")) {
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
}

// Loading fallback component
const PageLoader = () => (
  <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="loader-ring"></div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="app">
        <Analytics />
        <Navbar />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/trains" element={<Trains />} />
            <Route path="/pnr" element={<PnrStatus />} />
            <Route path="/charts" element={<VacancyCharts />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </Suspense>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
