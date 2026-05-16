import React, { useState } from 'react';
import { useToast } from './ui/toast-1';

interface PaymentModalProps {
  user: any;
  selectedTrain: any;
  selectedClass: string;
  passengers: any[];
  fromStn: string;
  toStn: string;
  travelDate: string;
  getToken: () => Promise<string | null>;
  onSuccess: (data: any) => void;
  onCancel: () => void;
  apiUrl: string;
  razorpayKeyId: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  user,
  selectedTrain,
  selectedClass,
  passengers,
  fromStn,
  toStn,
  travelDate,
  getToken,
  onSuccess,
  onCancel,
  apiUrl,
  razorpayKeyId
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { showToast } = useToast();

  const totalFare = (selectedTrain?.fares[selectedClass] || 0) * passengers.length;

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      const token = await getToken();

      // Step 1: Create Order
      const orderRes = await fetch(`${apiUrl}/payment_order`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: totalFare })
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.detail || "Failed to create order");

      // Step 2: Razorpay Options
      const options = {
        key: razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Railyn Payments",
        description: `Booking for ${selectedTrain.train_name}`,
        order_id: orderData.id,
        handler: async (response: any) => {
          // Step 3: Verify Signature
          const verifyRes = await fetch(`${apiUrl}/payment_verify`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          if (verifyRes.ok) {
            // Step 4: Finalize Booking
            await finalizeBooking(token);
            showToast("Payment verified successfully!", "success");
          } else {
            showToast("Payment verification failed!", "error");
            setIsProcessing(false);
          }
        },
        prefill: {
          name: user.fullName,
          email: user.primaryEmailAddress?.emailAddress,
        },
        theme: { color: "#1E6F2B" },
        modal: { ondismiss: () => setIsProcessing(false) }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Payment failed", "error");
      setIsProcessing(false);
    }
  };

  const finalizeBooking = async (token: string | null) => {
    try {
      const res = await fetch(`${apiUrl}/book_tkt`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          train_number: selectedTrain.train_number,
          train_name: selectedTrain.train_name,
          from_stn: fromStn.split(' - ')[0],
          to_stn: toStn.split(' - ')[0],
          departure: selectedTrain.departure,
          arrival: selectedTrain.arrival,
          travel_date: travelDate,
          class_type: selectedClass,
          passengers: passengers.map(p => ({
            name: p.name,
            age: parseInt(p.age),
            gender: p.gender
          })),
          user_name: user.fullName,
          user_email: user.primaryEmailAddress?.emailAddress,
          total_fare: totalFare
        })
      });
      const data = await res.json();
      onSuccess(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="processing-container" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div className="loader-ring"></div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', marginTop: '20px' }}>Securely Processing</h3>
        <p style={{ fontSize: '14px', color: '#666' }}>Please do not refresh or close this window...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#e0f2fe', padding: '6px 16px', borderRadius: '30px', marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Secure Razorpay Checkout</span>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b' }}>Confirm & Pay</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Secure your journey with just one click</p>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Train</span>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{selectedTrain?.train_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Journey</span>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{fromStn.split(' - ')[0]} → {toStn.split(' - ')[0]}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Fare Breakdown</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E6F2B' }}>₹{totalFare}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Inclusive of GST & Platform fees</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="btn btn-outline" style={{ flex: 1, height: '56px', borderRadius: '16px' }} onClick={onCancel}>Cancel</button>
        <button 
          className="btn btn-primary" 
          style={{ flex: 1.5, height: '56px', borderRadius: '16px', fontWeight: 800, background: 'linear-gradient(135deg, #1E6F2B 0%, #2d9a3e 100%)' }} 
          onClick={handlePayment}
        >
          Pay with Razorpay
        </button>
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>100% Encrypted & Secure</span>
      </div>
    </div>
  );
};

export default PaymentModal;
