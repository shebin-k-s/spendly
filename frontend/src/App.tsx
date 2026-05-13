import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Provider } from 'react-redux';

import { SwipeGestureProvider } from '@/context/SwipeGestureContext';
import { store } from '@/store/store';
import ProtectedRoute from '@/routes/ProtectedRoute';
import PublicRoute from '@/routes/PublicRoute';
import Layout from '@/components/Layout';

import UnlockPage from '@/features/unlock/UnlockPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import ExpensesPage from '@/features/expenses/pages/ExpensesPage';
import AddExpensePage from '@/features/expenses/pages/AddExpensePage';
import EditExpensePage from '@/features/expenses/pages/EditExpensePage';
import CategoriesPage from '@/features/categories/pages/CategoriesPage';
import AddCategoryPage from '@/features/categories/pages/AddCategoryPage';
import EditCategoryPage from '@/features/categories/pages/EditCategoryPage';
import AnalyticsPage from '@/features/analytics/pages/AnalyticsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SwipeGestureProvider>
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{ style: { background: 'hsl(0 0% 8%)', border: '1px solid hsl(0 0% 16%)', color: 'hsl(0 0% 95%)' } }}
        />
        <BrowserRouter>
          <Routes>
            <Route path="/unlock" element={<PublicRoute><UnlockPage /></PublicRoute>} />
            <Route path="/*" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="expenses/new" element={<AddExpensePage />} />
              <Route path="expenses/:id/edit" element={<EditExpensePage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="categories/new" element={<AddCategoryPage />} />
              <Route path="categories/:id/edit" element={<EditCategoryPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SwipeGestureProvider>
    </QueryClientProvider>
    </Provider>
  );
}
