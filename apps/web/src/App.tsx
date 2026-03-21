import { Outlet } from "@tanstack/react-router";

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 text-zinc-900">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
