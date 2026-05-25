import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Provider } from 'react-redux';

import { SwipeGestureProvider } from '@/context/SwipeGestureContext';
import { store } from '@/store/store';
import ProtectedRoute from '@/routes/ProtectedRoute';
import PublicRoute from '@/routes/PublicRoute';
import Layout from '@/components/Layout';

const UnlockPage          = lazy(() => import('@/features/unlock/UnlockPage'));
const DashboardPage       = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const ExpensesPage        = lazy(() => import('@/features/expenses/pages/ExpensesPage'));
const AddExpensePage      = lazy(() => import('@/features/expenses/pages/AddExpensePage'));
const EditExpensePage     = lazy(() => import('@/features/expenses/pages/EditExpensePage'));
const CategoriesPage      = lazy(() => import('@/features/categories/pages/CategoriesPage'));
const AddCategoryPage     = lazy(() => import('@/features/categories/pages/AddCategoryPage'));
const EditCategoryPage    = lazy(() => import('@/features/categories/pages/EditCategoryPage'));
const AnalyticsPage       = lazy(() => import('@/features/analytics/pages/AnalyticsPage'));
const AiTestPage          = lazy(() => import('@/features/expenses/pages/AiTestPage'));
const ShareProcessingPage = lazy(() => import('@/features/expenses/pages/ShareProcessingPage'));
const PendingSharesPage   = lazy(() => import('@/features/expenses/pages/PendingSharesPage'));
const PeoplePage          = lazy(() => import('@/features/people/pages/PeoplePage'));
const PersonDetailsPage   = lazy(() => import('@/features/people/pages/PersonDetailsPage'));
const EditPersonPage      = lazy(() => import('@/features/people/pages/EditPersonPage'));
const ShareToPeoplePage   = lazy(() => import('@/features/people/pages/ShareToPeoplePage'));

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
          position="bottom-center"
          gap={8}
          toastOptions={{
            style: {
              background: 'hsl(0 0% 12%)',
              border: '1px solid hsl(0 0% 18%)',
              color: 'hsl(0 0% 92%)',
              borderRadius: '16px',
              fontSize: '13px',
              fontWeight: '500',
              padding: '12px 16px',
              boxShadow: '0 8px 32px hsl(0 0% 0% / 0.4)',
            },
            classNames: {
              success: 'toast-success',
              error: 'toast-error',
            },
          }}
        />
        <BrowserRouter>
          <Suspense>
            <Routes>
              <Route path="/unlock" element={<PublicRoute><UnlockPage /></PublicRoute>} />
              <Route path="/share-processing" element={<ShareProcessingPage />} />
              <Route path="/ai-test" element={<ProtectedRoute><AiTestPage /></ProtectedRoute>} />
              <Route path="/*" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<DashboardPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="expenses/new" element={<AddExpensePage />} />
                <Route path="expenses/:id/edit" element={<EditExpensePage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="categories/new" element={<AddCategoryPage />} />
                <Route path="categories/:id/edit" element={<EditCategoryPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="people" element={<PeoplePage />} />
                <Route path="people/:id" element={<PersonDetailsPage />} />
                <Route path="people/:id/edit" element={<EditPersonPage />} />
                <Route path="share-to-people" element={<ShareToPeoplePage />} />
                <Route path="share-pending" element={<PendingSharesPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SwipeGestureProvider>
    </QueryClientProvider>
    </Provider>
  );
}
