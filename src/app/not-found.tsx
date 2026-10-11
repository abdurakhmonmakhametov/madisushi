import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-black text-brand">404</p>
        <p className="mt-3 text-lg">Sahifa topilmadi · Страница не найдена</p>
        <Link href="/" className="btn-primary mt-6 h-12">
          SUSHI
        </Link>
      </div>
    </div>
  );
}
