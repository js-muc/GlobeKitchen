import Link from "next/link";
export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Globe Organic Kitchen</h1>
      <p className="text-gray-600 mb-4">Management System</p>
      <Link href="/dashboard" className="underline text-brand">Go to Dashboard</Link>
    </main>
  );
}
