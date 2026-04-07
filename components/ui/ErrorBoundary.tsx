import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 shadow-2xl rounded-2xl p-8 border-2 border-red-500">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Algo salió mal</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              La aplicación encontró un error inesperado. Por favor, intenta recargar la página.
            </p>
            <div className="bg-gray-100 dark:bg-slate-700 p-4 rounded-lg mb-6 overflow-auto max-h-40">
              <code className="text-xs text-red-500 dark:text-red-300">
                {this.state.error?.toString()}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
