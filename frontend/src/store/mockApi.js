// Mimics an axios-style response so existing components (which read
// response.data / response.data.results) keep working without any change.
export function delay(data, ms = 200) {
  return new Promise((resolve) => setTimeout(() => resolve({ data }), ms))
}