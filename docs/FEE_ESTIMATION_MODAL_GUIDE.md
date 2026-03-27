# Fee Estimation Confirm Modal - Integration Guide

**Issue**: #166 - Implement Transaction Fee Estimation Overlay  
**Component**: `FeeEstimationConfirmModal`  
**Category**: FRONTEND  
**Difficulty**: MEDIUM

## Overview

The `FeeEstimationConfirmModal` is a responsive, accessible modal component that displays estimated network fees to users before they confirm a large bulk payout. It provides:

- **Real-time fee estimation** based on current Stellar network conditions
- **Transaction count estimation** for the batch
- **Congestion-aware safety margins** to ensure transactions succeed
- **Responsive design** that works on mobile, tablet, and desktop
- **Full accessibility** with ARIA labels, keyboard navigation, and screen reader support
- **Internationalization** support via i18next

## Features

### 1. Fee Estimation & Breakdown
- Base fee from the latest ledger
- Recommended fee based on network congestion
- Maximum fee ceiling (p99 percentile)
- Total cost calculation with safety margins

### 2. Network Status Indicators
- Congestion level badge (Low/Moderate/High)
- Ledger capacity usage percentage
- Visual warnings for high congestion periods

### 3. User Experience
- Clear payment summary (count, amount, currency)
- Estimated transaction count calculation
- Estimated cost highlighted in XLM
- Helpful tooltips and information sections
- Error handling with retry mechanism

### 4. Accessibility (WCAG 2.1 AA)
- ✅ ARIA labels and descriptions
- ✅ Semantic HTML and proper heading hierarchy
- ✅ Keyboard navigation (Tab, Escape)
- ✅ Focus management
- ✅ Color contrast meets WCAG AA standards
- ✅ Reduced motion support

### 5. Responsive Design
- Mobile-first approach
- Optimized for viewports 320px and up
- Flexible layout on desktop
- Touch-friendly button sizes (44px minimum)

## Installation & Setup

The component is already created and ready to use. Ensure these dependencies are available:

```bash
npm install react react-i18next @tanstack/react-query @stellar/design-system lucide-react
```

## Usage

### Basic Example

```typescript
import { useState } from 'react';
import { FeeEstimationConfirmModal } from '../components/FeeEstimationConfirmModal';

export function MyPaymentComponent() {
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    paymentCount: 10,
    totalAmount: '1000',
    currency: 'USDC',
  });

  const handleConfirmFees = () => {
    // Proceed with payment submission
    console.log('User confirmed fees, proceeding with payment...');
    setShowFeeModal(false);
    submitPayment(paymentData);
  };

  const handleCancelFees = () => {
    setShowFeeModal(false);
  };

  return (
    <>
      <button onClick={() => setShowFeeModal(true)}>
        Preview & Confirm Payment
      </button>

      <FeeEstimationConfirmModal
        isOpen={showFeeModal}
        paymentCount={paymentData.paymentCount}
        totalAmount={paymentData.totalAmount}
        currency={paymentData.currency}
        onConfirm={handleConfirmFees}
        onCancel={handleCancelFees}
      />
    </>
  );
}
```

### Integration with BulkPayrollUpload

Here's a practical example of integrating the modal into the bulk payroll upload workflow:

```typescript
// pages/BulkPayrollUpload.tsx
import { useState } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { CSVUploader, type CSVRow } from '../components/CSVUploader';
import { FeeEstimationConfirmModal } from '../components/FeeEstimationConfirmModal';
import { Button, Card } from '@stellar/design-system';

const REQUIRED_COLUMNS = ['name', 'wallet_address', 'amount', 'currency'];

export default function BulkPayrollUpload() {
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);

  const validRows = parsedRows.filter((r) => r.isValid);
  const totalAmount = validRows.reduce((sum, r) => {
    const amount = parseFloat(r.data.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  // Determine primary currency from first valid row
  const primaryCurrency = validRows[0]?.data.currency?.toUpperCase() || 'XLM';

  const handleReviewPayment = () => {
    if (validRows.length === 0) return;
    setShowFeeModal(true);
  };

  const handleConfirmFees = async () => {
    try {
      // Submit the batch payment
      const response = await submitPayrollBatch(validRows);
      console.log('Batch submitted:', response);
      setShowFeeModal(false);
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit batch:', error);
      // Handle error - show notification to user
    }
  };

  if (submitted) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <div className="p-8 text-center space-y-4">
            <div className="text-5xl">✓</div>
            <h2 className="text-2xl font-bold">Payroll Batch Submitted</h2>
            <p className="text-gray-600">
              {validRows.length} payment{validRows.length !== 1 ? 's' : ''} queued for processing.
            </p>
            <Button variant="secondary" size="md" onClick={() => {
              setParsedRows([]);
              setSubmitted(false);
            }}>
              Upload Another File
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Bulk Payroll Upload</h1>
        <p className="text-gray-600">
          Upload a CSV file to process multiple payroll payments at once.
        </p>
      </div>

      <Card>
        <div className="p-6">
          <CSVUploader
            requiredColumns={REQUIRED_COLUMNS}
            validators={validators}
            onDataParsed={setParsedRows}
          />
        </div>
      </Card>

      {parsedRows.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 space-x-4">
            <span className="text-green-700 font-medium">{validRows.length} valid</span>
            {parsedRows.filter((r) => !r.isValid).length > 0 && (
              <span className="text-red-600 font-medium">
                {parsedRows.filter((r) => !r.isValid).length} with errors
              </span>
            )}
          </div>

          {/* Review & Confirm Button */}
          <Button
            variant="primary"
            onClick={handleReviewPayment}
            disabled={validRows.length === 0}
          >
            Review & Confirm Payment
          </Button>
        </div>
      )}

      {/* Fee Estimation Modal */}
      <FeeEstimationConfirmModal
        isOpen={showFeeModal}
        paymentCount={validRows.length}
        totalAmount={totalAmount.toFixed(2)}
        currency={primaryCurrency}
        onConfirm={handleConfirmFees}
        onCancel={() => setShowFeeModal(false)}
        confirmLabel="Confirm & Pay"
        cancelLabel="Back to Upload"
      />
    </div>
  );
}
```

## Props

### FeeEstimationConfirmModalProps

```typescript
interface FeeEstimationConfirmModalProps {
  /** Number of payment operations in the batch */
  paymentCount: number;
  
  /** Total amount being sent (in the payment's base unit) */
  totalAmount: string;
  
  /** Primary currency of the payments (e.g., 'XLM', 'USDC') */
  currency: string;
  
  /** Whether the modal is open */
  isOpen: boolean;
  
  /** Callback when user confirms the fee estimate and wants to proceed */
  onConfirm: () => void;
  
  /** Callback when user cancels/closes the modal */
  onCancel: () => void;
  
  /** Optional: Custom CSS class for styling */
  className?: string;
  
  /** Optional: Label for confirm button (default: "Confirm & Continue") */
  confirmLabel?: string;
  
  /** Optional: Label for cancel button (default: "Cancel") */
  cancelLabel?: string;
}
```

## Accessibility Features

### Keyboard Navigation
- **Tab**: Navigate between buttons
- **Escape**: Close the modal
- **Enter/Space**: Activate buttons

### ARIA Attributes
- `dialog` role with `aria-modal="true"`
- `aria-labelledby` for title
- `aria-describedby` for description
- Status indicators with `aria-label`
- Alert role for error messages

### Screen Reader Support
- Semantic HTML with proper headings
- Labels and descriptions for all interactive elements
- Status messages announced to screen readers
- Loading states indicated with `aria-busy="true"`

### Visual Accessibility
- ✅ Color contrast ratio 4.5:1 or higher (text)
- ✅ Clear focus indicators (2px outline)
- ✅ No color-only information (icons + text)
- ✅ Readable font sizes (minimum 12px)

## Responsive Design

### Breakpoints
- **Mobile** (< 640px): Full-width with padding
- **Tablet** (640px - 1024px): Optimized spacing
- **Desktop** (> 1024px): Maximum width 600px, centered

### Mobile Considerations
- Button stacking on small screens
- Touch-friendly sizes (44px minimum height)
- Simplified layout for readability
- Readable font sizes without pinch-zoom

### Reduced Motion
- Animations disabled for users with `prefers-reduced-motion: reduce`
- All interactive elements remain functional

## Internationalization

The component uses i18next for translations. Required keys:

```json
{
  "feeEstimation": {
    "confirmModal": {
      "title": "Network Fee Estimation",
      "subtitle": "Review estimated fees before confirming your bulk payout",
      "paymentSummary": "Payment Summary",
      "paymentCount": "Total Payments",
      "totalAmount": "Total Amount",
      "estimatedTxCount": "Est. Transactions",
      "estimatedTxCountHelp": "Including on-chain processing",
      "networkStatus": "Network Status",
      "baseFee": "Base Fee",
      "recommendedFee": "Recommended Fee",
      "safetyMargin": "Safety Margin",
      "safetyMarginHelp": "Applied due to network congestion",
      "estimatedCost": "Estimated Cost",
      "estimateCostTooltip": "This is an estimate based on current network conditions. Actual fees may vary slightly.",
      "totalFee": "Total Fee",
      "feePerTx": "Fee per transaction",
      "highCongestion": "High Network Congestion",
      "highCongestionMessage": "Network congestion is high. Fees may increase. Consider retrying in a few minutes.",
      "processingTime": "Processing typically takes 5-30 seconds depending on network conditions.",
      "confirm": "Confirm & Continue"
    },
    "congestion": {
      "low": "Low",
      "moderate": "Moderate",
      "high": "High"
    },
    "error": {
      "title": "Failed to estimate fees",
      "message": "Unable to fetch current network fees"
    }
  },
  "common": {
    "retry": "Retry",
    "close": "Close",
    "cancel": "Cancel"
  }
}
```

## Error Handling

The component gracefully handles various error scenarios:

### Network Failures
- Displays error message with retry button
- Shows user-friendly error text
- Disables confirm button during errors

### Edge Cases
- Handles zero payment count
- Scales for large batch sizes (10,000+)
- Supports very small fee values
- Works with different currencies

## Testing

Comprehensive test suite included covering:

- ✅ Component rendering and visibility
- ✅ Fee calculation and estimation
- ✅ User interactions (confirm/cancel/close)
- ✅ Keyboard navigation and accessibility
- ✅ Responsive behavior
- ✅ Loading and error states
- ✅ Congestion indicators and warnings
- ✅ Custom props and labels
- ✅ Edge cases and boundary conditions

Run tests:
```bash
npm run test FeeEstimationConfirmModal
```

## Performance Considerations

- **Memoized calculations**: Fee estimates computed only when dependencies change
- **Efficient rendering**: No unnecessary re-renders
- **Lazy loading**: Fee data fetched on-demand via React Query
- **Debounced polling**: Fee updates every 10 seconds (configurable)

## Styling & Customization

The component uses Tailwind CSS variables for theming:

```css
/* Dark theme (default) */
--bg: #080b10
--surface: #0d1117
--text: #e8eaf0
--muted: #8b949e
--accent: #4af0b8
--accent2: #7c6ff7
--danger: #ff7b72
--success: #3fb950
```

To customize, override CSS variables in your theme:

```css
:root {
  --accent: #your-color;
  --danger: #your-error-color;
}
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Known Limitations

1. **Transaction count estimation**: Based on average case (1.5x multiplier). Actual count depends on operation specifics.
2. **Fee updates**: Refreshed every 10 seconds. Real-time fees may change slightly between modal display and submission.
3. **Single batch**: Currently estimates for one bulk payout. Multiple separate batches require multiple submissions.

## Future Enhancements

- [ ] Multi-currency fee comparison
- [ ] Historical fee trends chart
- [ ] Manual fee override for advanced users
- [ ] Fee price alerts/notifications
- [ ] Export fee estimate as PDF
- [ ] Integration with wallet signing flows

## Acceptance Criteria Status

- ✅ **Implement the described feature/fix**: Fee estimation modal fully implemented
- ✅ **Ensure full responsiveness and accessibility**: Mobile-first responsive design + WCAG 2.1 AA compliance
- ✅ **Add relevant unit or integration tests**: Comprehensive test suite with 30+ test cases
- ✅ **Update documentation where necessary**: Complete integration guide + API documentation

## Related Issues

- #42 - Fee estimation service
- #265 - Circuit breaker / emergency pause
- #261 - Graceful batch refund mechanism

## Support & Feedback

For issues or feature requests, please create a GitHub issue or contact the development team.
