import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // Skenario stress test
  stages: [
    { duration: '10s', target: 100 }, // Naik bertahap ke 100 virtual users (VUs) dalam 10 detik
    { duration: '20s', target: 100 }, // Bertahan di 100 VUs selama 20 detik
    { duration: '10s', target: 0 },   // Turun kembali ke 0 VUs dalam 10 detik
  ],
};

// Setup dijalankan 1 kali sebelum VUs mulai menyerang
export function setup() {
  const purchaseUrl = __ENV.API_URL || 'http://localhost:3000/purchase';
  // Dapatkan base URL (misal: http://localhost:3000)
  const baseUrl = purchaseUrl.replace('/purchase', '');
  
  // Ambil status flash sale untuk mendapatkan productId yang asli dari database
  const res = http.get(`${baseUrl}/flash-sale/status`);
  let productId = 'flash-sale-product-id'; // Fallback
  
  if (res.status === 200) {
    const body = res.json();
    if (body && body.productId) {
      productId = body.productId;
    }
  }
  
  // Data ini akan diteruskan ke fungsi default (setiap VU)
  return { productId: productId };
}

export default function (data) {
  // Endpoint backend yang akan ditembak (bisa di-override lewat environment variable)
  const url = __ENV.API_URL || 'http://localhost:3000/purchase';
  
  // Buat random user ID agar tiap request dianggap dari user yang berbeda
  const randomUserId = `user-${Math.floor(Math.random() * 1000000)}`;
  
  const payload = JSON.stringify({
    userId: randomUserId,
    productId: data.productId // Menggunakan ID asli dari server
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  // Pengecekan respons
  // Sukses biasanya 201, kalau sudah habis (sold out) biasanya 400
  check(res, {
    'status is 201 or 400': (r) => r.status === 201 || r.status === 400,
  });

  // Jeda kecil per user setelah mengirim request
  sleep(0.1);
}
