import { Search, X } from 'lucide-react';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { PAYMENT_METHOD_LABELS } from '../utils/expenseUtils';
import type { PaymentMethod } from '../types';
import { AnimatePresence, motion } from 'framer-motion';

const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'cash', 'bank_transfer', 'other'];

interface ExpenseFilterProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategoryId: string;
  onCategoryChange: (id: string) => void;
  selectedPaymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  onClearFilters: () => void;
}

export default function ExpenseFilter({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  selectedCategoryId,
  onCategoryChange,
  selectedPaymentMethod,
  onPaymentMethodChange,
  onClearFilters,
}: ExpenseFilterProps) {
  const { data: categories = [] } = useCategoriesQuery();

  const hasActiveFilters = searchTerm || selectedCategoryId || selectedPaymentMethod;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-b border-border bg-card/50 px-4 py-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Filter Transactions</h3>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={onClearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  Clear all
                </button>
              )}
              <button onClick={onClose} className="p-1 rounded-full bg-secondary/80 hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search description or note..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-secondary text-secondary-foreground rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Category</label>
            <div className="flex gap-2 overflow-x-auto disable-scrollbars pb-1">
              <button
                onClick={() => onCategoryChange('')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                  ${!selectedCategoryId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onCategoryChange(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap
                    ${selectedCategoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Payment Method</label>
            <div className="flex gap-2 overflow-x-auto disable-scrollbars pb-1">
              <button
                onClick={() => onPaymentMethodChange('')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                  ${!selectedPaymentMethod ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
              >
                All
              </button>
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  onClick={() => onPaymentMethodChange(method)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                    ${selectedPaymentMethod === method ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
