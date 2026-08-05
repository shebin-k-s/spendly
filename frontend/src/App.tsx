import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Provider } from 'react-redux';

import { SwipeGestureProvider } from '@/context/SwipeGestureContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
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
import CategoryDetailsPage from '@/features/categories/pages/CategoryDetailsPage';
import AnalyticsPage from '@/features/analytics/pages/AnalyticsPage';
import AiTestPage from '@/features/expenses/pages/AiTestPage';
import ShareProcessingPage from '@/features/expenses/pages/ShareProcessingPage';
import PendingSharesPage from '@/features/expenses/pages/PendingSharesPage';
import PeoplePage from '@/features/people/pages/PeoplePage';
import PersonDetailsPage from '@/features/people/pages/PersonDetailsPage';
import EditPersonPage from '@/features/people/pages/EditPersonPage';
import ShareToPeoplePage from '@/features/people/pages/ShareToPeoplePage';

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // Keep cache for 7 days

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: CACHE_MAX_AGE
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

export default function App() {
  return (
    <ThemeProvider>
    <Provider store={store}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: CACHE_MAX_AGE,
          dehydrateOptions: {
            // Keep queries that still have data even if the last background
            // revalidation errored (e.g. offline) — otherwise a failed refetch
            // wipes that query from localStorage on the next persist save.
            shouldDehydrateQuery: (query) =>
              defaultShouldDehydrateQuery(query) || query.state.data !== undefined,
          },
        }}
      >
        <SwipeGestureProvider>
        <AppToaster />
        <BrowserRouter>
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
              <Route path="categories/:id" element={<CategoryDetailsPage />} />
              <Route path="categories/:id/edit" element={<EditCategoryPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonDetailsPage />} />
              <Route path="people/:id/edit" element={<EditPersonPage />} />
              <Route path="share-to-people" element={<ShareToPeoplePage />} />
              <Route path="share-pending" element={<PendingSharesPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SwipeGestureProvider>
    </PersistQueryClientProvider>
    </Provider>
    </ThemeProvider>
  );
}

function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="bottom-center"
      gap={8}
      toastOptions={{
        style: {
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--foreground))',
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
  );
}
