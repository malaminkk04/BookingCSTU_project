const API_BASE_URL = "http://localhost:5001";

export function getApiAssetUrl(path) {
  if (
    typeof path !== "string" ||
    !/^\/uploads\/rooms\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(path)
  ) {
    return null;
  }

  return `${API_BASE_URL}${path}`;
}

export default API_BASE_URL;
