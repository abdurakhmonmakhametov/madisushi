// Address lookup adapter.
//  - "local": a built-in gazetteer of Tashkent areas (no network, no key).
//    Customers pick an area and type street/house themselves.
//  - "yandex": NOT IMPLEMENTED. Requires a Yandex Geocoder key and an
//    implementation checked against Yandex's current documentation.
import { distanceMeters, type LatLng } from "../geo";

export interface Place {
  id: string;
  name: { uz: string; ru: string };
  district: { uz: string; ru: string };
  lat: number;
  lng: number;
}

const D = {
  chilonzor: { uz: "Chilonzor tumani", ru: "Чиланзарский район" },
  yunusobod: { uz: "Yunusobod tumani", ru: "Юнусабадский район" },
  sergeli: { uz: "Sergeli tumani", ru: "Сергелийский район" },
  mirzo: { uz: "Mirzo Ulug'bek tumani", ru: "Мирзо-Улугбекский район" },
  yakkasaroy: { uz: "Yakkasaroy tumani", ru: "Яккасарайский район" },
  shayx: { uz: "Shayxontohur tumani", ru: "Шайхантахурский район" },
  olmazor: { uz: "Olmazor tumani", ru: "Алмазарский район" },
  uchtepa: { uz: "Uchtepa tumani", ru: "Учтепинский район" },
  yashnobod: { uz: "Yashnobod tumani", ru: "Яшнабадский район" },
  mirobod: { uz: "Mirobod tumani", ru: "Мирабадский район" },
  bektemir: { uz: "Bektemir tumani", ru: "Бектемирский район" },
  region: { uz: "Toshkent viloyati", ru: "Ташкентская область" },
};

export const PLACES: Place[] = [
  { id: "amir-temur", name: { uz: "Amir Temur xiyoboni", ru: "Сквер Амира Темура" }, district: D.yunusobod, lat: 41.3111, lng: 69.2797 },
  { id: "chilonzor-9", name: { uz: "Chilonzor-9 mavzesi", ru: "Чиланзар-9" }, district: D.chilonzor, lat: 41.2756, lng: 69.2034 },
  { id: "chilonzor-19", name: { uz: "Chilonzor-19 mavzesi", ru: "Чиланзар-19" }, district: D.chilonzor, lat: 41.2618, lng: 69.1905 },
  { id: "novza", name: { uz: "Novza", ru: "Новза" }, district: D.chilonzor, lat: 41.2930, lng: 69.2230 },
  { id: "yunusobod-4", name: { uz: "Yunusobod-4 mavzesi", ru: "Юнусабад-4" }, district: D.yunusobod, lat: 41.3646, lng: 69.2864 },
  { id: "yunusobod-19", name: { uz: "Yunusobod-19 mavzesi", ru: "Юнусабад-19" }, district: D.yunusobod, lat: 41.3712, lng: 69.3015 },
  { id: "minor", name: { uz: "Minor", ru: "Минор" }, district: D.yunusobod, lat: 41.3290, lng: 69.2840 },
  { id: "sergeli-3a", name: { uz: "Sergeli-IIIa massivi", ru: "массив Сергели-IIIa" }, district: D.sergeli, lat: 41.2229, lng: 69.2206 },
  { id: "sergeli-8", name: { uz: "Sergeli-8 massivi", ru: "массив Сергели-8" }, district: D.sergeli, lat: 41.2152, lng: 69.2331 },
  { id: "quyliq", name: { uz: "Qo'yliq", ru: "Куйлюк" }, district: D.bektemir, lat: 41.2400, lng: 69.3150 },
  { id: "buyuk-ipak", name: { uz: "Buyuk Ipak Yo'li", ru: "Буюк Ипак Йули" }, district: D.mirzo, lat: 41.3270, lng: 69.3280 },
  { id: "ttz", name: { uz: "TTZ", ru: "ТТЗ" }, district: D.mirzo, lat: 41.3450, lng: 69.3570 },
  { id: "oybek", name: { uz: "Oybek metro", ru: "метро Ойбек" }, district: D.mirobod, lat: 41.2980, lng: 69.2750 },
  { id: "tashkent-city", name: { uz: "Tashkent City", ru: "Ташкент Сити" }, district: D.shayx, lat: 41.3160, lng: 69.2480 },
  { id: "chorsu", name: { uz: "Chorsu bozori", ru: "базар Чорсу" }, district: D.shayx, lat: 41.3265, lng: 69.2346 },
  { id: "beruniy", name: { uz: "Beruniy metro", ru: "метро Беруни" }, district: D.olmazor, lat: 41.3440, lng: 69.2080 },
  { id: "qoraqamish", name: { uz: "Qoraqamish", ru: "Каракамыш" }, district: D.olmazor, lat: 41.3380, lng: 69.1850 },
  { id: "uchtepa", name: { uz: "Uchtepa", ru: "Учтепа" }, district: D.uchtepa, lat: 41.2880, lng: 69.1730 },
  { id: "yakkasaroy", name: { uz: "Bobur bog'i", ru: "Парк Бабура" }, district: D.yakkasaroy, lat: 41.2890, lng: 69.2560 },
  { id: "yashnobod", name: { uz: "Aviasozlar", ru: "Авиастроитель" }, district: D.yashnobod, lat: 41.2900, lng: 69.3440 },
  { id: "bektemir", name: { uz: "Bektemir", ru: "Бектемир" }, district: D.bektemir, lat: 41.2190, lng: 69.3380 },
  // outside the ring road (TXAY) — surcharge zones
  { id: "zangiota", name: { uz: "Zangiota", ru: "Зангиата" }, district: D.region, lat: 41.1920, lng: 69.1440 },
  { id: "qibray", name: { uz: "Qibray", ru: "Кибрай" }, district: D.region, lat: 41.3900, lng: 69.4600 },
  { id: "keles", name: { uz: "Keles", ru: "Келес" }, district: D.region, lat: 41.4180, lng: 69.2080 },
  { id: "chirchiq", name: { uz: "Chirchiq", ru: "Чирчик" }, district: D.region, lat: 41.4690, lng: 69.5820 },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[ʻʼ'`‘’]/g, "").replace(/\s+/g, " ").trim();
}

export async function searchPlaces(q: string, limit = 8): Promise<Place[]> {
  const provider = process.env.GEOCODER_PROVIDER || "local";
  if (provider !== "local") {
    throw new Error(`GEOCODER_PROVIDER=${provider} is not implemented; use "local"`);
  }
  const n = norm(q);
  if (!n) return PLACES.slice(0, limit);
  return PLACES.filter((p) => [p.name.uz, p.name.ru, p.district.uz, p.district.ru].some((s) => norm(s).includes(n))).slice(0, limit);
}

export function nearestPlace(point: LatLng): Place {
  return PLACES.reduce((best, p) =>
    distanceMeters(point, [p.lat, p.lng]) < distanceMeters(point, [best.lat, best.lng]) ? p : best,
  );
}
