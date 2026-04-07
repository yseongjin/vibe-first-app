/**
 * OpenWeather 현재 날씨 예제
 * - API Key는 변수(세션 메모리)에만 보관, localStorage 사용 안 함
 * - geolocation → fetch 순서로 동작
 */

// ----- DOM 요소 참조 (한 번만 찾아 두면 이후에 재사용하기 쉽습니다) -----
const form = document.getElementById("weather-form");
const apiKeyInput = document.getElementById("api-key-input");
const fetchBtn = document.getElementById("fetch-btn");
const statusEl = document.getElementById("status-message");
const cardPlaceholder = document.getElementById("card-placeholder");
const weatherResult = document.getElementById("weather-result");
const cityNameEl = document.getElementById("city-name");
const temperatureEl = document.getElementById("temperature");
const weatherIconEl = document.getElementById("weather-icon");
const weatherDescEl = document.getElementById("weather-desc");
const feelsLikeEl = document.getElementById("feels-like");
const humidityEl = document.getElementById("humidity");
const windSpeedEl = document.getElementById("wind-speed");

/**
 * 세션 동안만 유지되는 API Key (새로고침하면 사라짐)
 * localStorage에는 절대 넣지 않습니다.
 */
let sessionApiKey = "";

/**
 * 로딩 중 버튼 비활성화 + 상태 메시지 표시
 * @param {string} message - 사용자에게 보여 줄 안내 문구
 */
function setLoading(message) {
  fetchBtn.disabled = true;
  fetchBtn.setAttribute("aria-busy", "true");
  statusEl.textContent = message;
  statusEl.classList.remove("is-error");
}

/**
 * 로딩 종료 후 버튼 다시 활성화
 */
function clearLoading() {
  fetchBtn.disabled = false;
  fetchBtn.setAttribute("aria-busy", "false");
}

/**
 * 오류 메시지를 상태 영역에 빨간색 스타일로 표시
 * @param {string} message
 */
function showError(message) {
  statusEl.textContent = message;
  statusEl.classList.add("is-error");
}

/**
 * 성공·대기 시 일반 스타일로 상태 영역 비우기 또는 안내
 * @param {string} [message=""]
 */
function clearStatus(message = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error");
}

/**
 * 브라우저 geolocation으로 위도·경도 얻기 (Promise로 감싸서 async/await에 맞춤)
 * @returns {Promise<{ lat: number, lon: number }>}
 */
function getUserLocation() {
  return new Promise((resolve, reject) => {
    // 구형 브라우저 등에서 geolocation 자체가 없을 수 있음
    if (!navigator.geolocation) {
      reject(new Error("GEO_NOT_SUPPORTED"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // coords 안에 위도(latitude), 경도(longitude)가 들어 있습니다
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (err) => {
        // 사용자가 거부했거나, 위치를 잠시 못 구한 경우 등
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("GEO_DENIED"));
        } else {
          reject(new Error("GEO_FAILED"));
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * OpenWeather 현재 날씨 API 호출
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @returns {Promise<object>} 파싱된 JSON 객체
 */
async function fetchWeather(lat, lon, apiKey) {
  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}` +
    `&appid=${encodeURIComponent(apiKey)}` +
    `&units=metric&lang=kr`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    // 네트워크 끊김, CORS 이슈(로컬에서 잘못 연 경우) 등
    throw new Error("NETWORK");
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("BAD_JSON");
  }

  if (!response.ok) {
    // 401이면 보통 API Key 문제
    if (response.status === 401) {
      throw new Error("API_UNAUTHORIZED");
    }
    const msg =
      data && data.message ? String(data.message) : `HTTP ${response.status}`;
    throw new Error(`API_ERROR:${msg}`);
  }

  return data;
}

/**
 * 응답 JSON이 우리가 기대하는 형태인지 간단히 검사
 * @param {object} data
 * @returns {boolean}
 */
function isValidWeatherPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.name !== "string" || data.name.trim() === "") return false;
  if (!data.main || typeof data.main.temp !== "number") return false;
  if (!Array.isArray(data.weather) || data.weather.length === 0) return false;
  if (typeof data.weather[0].icon !== "string") return false;
  // 체감·습도는 보통 항상 옴; 없으면 렌더 단계에서 대체 표기
  return true;
}

/**
 * 날씨 데이터를 카드에 그리기
 * @param {object} data - OpenWeather /weather 응답
 */
function renderWeather(data) {
  cardPlaceholder.classList.add("hidden");
  weatherResult.classList.remove("hidden");

  const w0 = data.weather[0];
  const iconCode = w0.icon;
  const desc = w0.description || "";

  cityNameEl.textContent = data.name;
  temperatureEl.textContent = `${Math.round(data.main.temp)}°C`;

  // 아이콘 URL 형식: https://openweathermap.org/img/wn/{icon}@2x.png
  weatherIconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  // 스크린 리더용: 무슨 날씨인지 alt에 반영
  weatherIconEl.alt = desc
    ? `현재 날씨: ${desc}`
    : "현재 날씨 아이콘";

  weatherDescEl.textContent = desc;
  weatherDescEl.hidden = !desc;

  // 우측 열: 체감온도(main.feels_like), 습도(%), 풍속(m/s, metric)
  const main = data.main;
  const feels =
    typeof main.feels_like === "number"
      ? `${Math.round(main.feels_like)}°C`
      : "—";
  const hum =
    typeof main.humidity === "number" ? `${Math.round(main.humidity)}%` : "—";
  let windText = "—";
  if (data.wind && typeof data.wind.speed === "number") {
    // 소수 한 자리까지 표시 (바람이 약할 때도 읽기 쉽게)
    windText = `${data.wind.speed.toFixed(1)} m/s`;
  }
  feelsLikeEl.textContent = feels;
  humidityEl.textContent = hum;
  windSpeedEl.textContent = windText;
}

/**
 * 지오/날씨 오류 코드를 한국어 메시지로 바꿈
 * @param {Error} err
 * @returns {string}
 */
function mapErrorToMessage(err) {
  const code = err && err.message ? err.message : "";
  switch (code) {
    case "GEO_NOT_SUPPORTED":
      return "이 브라우저는 위치 정보(geolocation)를 지원하지 않습니다.";
    case "GEO_DENIED":
      return "위치 권한이 거부되었습니다.";
    case "GEO_FAILED":
      return "위치 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "NETWORK":
      return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.";
    case "API_UNAUTHORIZED":
      return "API Key가 올바르지 않습니다.";
    case "BAD_JSON":
      return "서버 응답을 해석할 수 없습니다.";
    case "INVALID_DATA":
      return "응답 데이터가 예상과 다릅니다.";
    default:
      if (code.startsWith("API_ERROR:")) {
        return `날씨 API 오류: ${code.replace("API_ERROR:", "")}`;
      }
      return "알 수 없는 오류가 발생했습니다.";
  }
}

/**
 * 폼 제출 시 전체 흐름: Key 확인 → 위치 → 날씨 → 렌더
 * @param {Event} event
 */
async function handleSubmit(event) {
  event.preventDefault();

  const rawKey = apiKeyInput.value.trim();
  if (!rawKey) {
    showError("API Key를 입력해 주세요.");
    return;
  }

  // 이번 세션에서만 사용할 Key를 변수에 저장 (페이지 닫기 전까지 메모리에만 존재)
  sessionApiKey = rawKey;

  clearStatus();
  setLoading("위치 정보를 가져오는 중...");

  let lat;
  let lon;
  try {
    const pos = await getUserLocation();
    lat = pos.lat;
    lon = pos.lon;
  } catch (e) {
    clearLoading();
    showError(mapErrorToMessage(e));
    return;
  }

  setLoading("날씨 정보를 불러오는 중...");

  try {
    const data = await fetchWeather(lat, lon, sessionApiKey);
    if (!isValidWeatherPayload(data)) {
      throw new Error("INVALID_DATA");
    }
    renderWeather(data);
    clearStatus();
  } catch (e) {
    showError(mapErrorToMessage(e));
  } finally {
    clearLoading();
  }
}

// 폼 제출(버튼 클릭, 입력창에서 Enter) 모두 여기로 모입니다
form.addEventListener("submit", handleSubmit);
