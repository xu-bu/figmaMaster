// ============================================================
// Axios HTTP client — matches eCommerceERP pattern
// ============================================================

import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api",
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

// Response interceptor — unwrap { success, data, error }
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error?.message ||
      error.message ||
      "网络请求失败";
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
