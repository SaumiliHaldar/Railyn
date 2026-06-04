import React, { useState } from 'react';
import { useToast } from './ui/toast-1';
import { ShieldCheck, Calendar, Users, Train, ArrowRight, Lock, ArrowLeft } from 'lucide-react';

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
          // Step 3: Unified Secure Transaction Flow
          try {
            await finalizeBooking(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
            showToast("Payment verified and booking confirmed successfully!", "success");
          } catch (err: any) {
            showToast(err.message || "Failed to finalize booking!", "error");
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

  const finalizeBooking = async (
    orderId?: string,
    paymentId?: string,
    signature?: string
  ) => {
    try {
      const freshToken = await getToken();
      const res = await fetch(`${apiUrl}/book_tkt`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshToken}`
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
          total_fare: totalFare,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Booking failed on server");
      }
      onSuccess(data);
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const formattedDate = new Date(travelDate).toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const passengerNames = passengers.map(p => p.name).join(', ');

  if (isProcessing) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '4px solid var(--primary-light)',
          borderTopColor: 'var(--primary)',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px', marginTop: '20px', fontFamily: 'var(--heading)' }}>Securely Processing</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Contacting Razorpay Gateway. Please do not close or refresh...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'var(--sans)', color: 'var(--text-main)' }}>
      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={onCancel}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            borderRadius: '50%',
            transition: 'all 0.2s'
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          title="Go Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          background: 'var(--primary-light)', 
          padding: '6px 14px', 
          borderRadius: '100px', 
          marginBottom: '10px',
          border: '1px solid rgba(30, 111, 43, 0.1)'
        }}>
          <ShieldCheck size={14} color="var(--primary)" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Secure Checkout
          </span>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--heading)', margin: 0 }}>
          Confirm & Pay
        </h2>
      </div>

      {/* Ticket Details Box */}
      <div style={{ 
        background: '#f8fafc', 
        border: '1px dashed #cbd5e1', 
        borderRadius: '12px', 
        padding: '16px', 
        marginBottom: '20px',
        position: 'relative'
      }}>
        {/* Ticket Header (Train info) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Train size={16} color="var(--primary)" />
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{selectedTrain?.train_name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                {selectedTrain?.train_number}
              </span>
            </div>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: '4px' }}>
            {selectedClass}
          </span>
        </div>

        {/* Route Details */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{fromStn.split(' - ')[0]}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedTrain?.departure}</div>
          </div>
          <ArrowRight size={16} color="var(--text-muted)" />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{toStn.split(' - ')[0]}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedTrain?.arrival}</div>
          </div>
        </div>

        {/* Date and Passengers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '10px 0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>{formattedDate}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
              {passengers.length} Passenger{passengers.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Passenger Names List */}
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={passengerNames}>
          <strong>Passengers:</strong> {passengerNames}
        </div>
      </div>

      {/* Pricing Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--primary-light)', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(30, 111, 43, 0.08)' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>Total Payable Amount</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Incl. of all processing charges</span>
        </div>
        <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--primary)', fontFamily: 'var(--heading)' }}>
          ₹{totalFare}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <button 
          type="button"
          style={{ 
            width: '100%',
            maxWidth: '320px',
            height: '46px', 
            borderRadius: '8px', 
            fontWeight: 800, 
            fontSize: '14px',
            background: 'var(--primary)', 
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px var(--primary-glow)',
            transition: 'all 0.2s'
          }} 
          onMouseOver={e => { e.currentTarget.style.background = 'var(--secondary)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.transform = 'none'; }}
          onClick={handlePayment}
        >
          Pay with Razorpay
        </button>
      </div>

      {/* Trust Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: 0.8 }}>
        <Lock size={12} color="var(--text-muted)" />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
          100% Secure & Encrypted Transactions
        </span>
      </div>
    </div>
  );
};

export default PaymentModal;
