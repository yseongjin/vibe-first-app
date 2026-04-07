const searchForm = document.getElementById("searchForm");
const statusMessage = document.getElementById("statusMessage");
const resultsContainer = document.getElementById("results");
const searchBtn = document.getElementById("searchBtn");
const chartCanvas = document.getElementById("engagementChart");

let chartInstance = null;

const numberFormatter = new Intl.NumberFormat("ko-KR");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function calculateEngagementRate(viewCount, likeCount, commentCount) {
  if (!viewCount) return 0;
  return ((likeCount + commentCount) / viewCount) * 100;
}

async function searchVideos(apiKey, keyword, maxResults) {
  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    q: keyword,
    type: "video",
    maxResults: String(maxResults),
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("검색 API 호출에 실패했습니다.");
  }

  const data = await response.json();
  return data.items ?? [];
}

async function fetchVideoDetails(apiKey, videoIds) {
  if (!videoIds.length) return [];

  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet,statistics",
    id: videoIds.join(","),
    maxResults: String(videoIds.length),
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("영상 상세 API 호출에 실패했습니다.");
  }

  const data = await response.json();
  return data.items ?? [];
}

function toVideoViewModel(item) {
  const stats = item.statistics ?? {};
  const viewCount = Number(stats.viewCount ?? 0);
  const likeCount = Number(stats.likeCount ?? 0);
  const commentCount = Number(stats.commentCount ?? 0);
  const engagementRate = calculateEngagementRate(viewCount, likeCount, commentCount);

  return {
    videoId: item.id,
    title: item.snippet?.title ?? "제목 없음",
    thumbnail: item.snippet?.thumbnails?.high?.url ?? "",
    channelTitle: item.snippet?.channelTitle ?? "채널 정보 없음",
    viewCount,
    likeCount,
    commentCount,
    engagementRate,
  };
}

function renderCards(videos) {
  resultsContainer.innerHTML = "";

  if (!videos.length) {
    resultsContainer.innerHTML = "<p>검색 결과가 없습니다.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  videos.forEach((video) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
      <div class="card-body">
        <h3 class="card-title">${video.title}</h3>
        <div class="stats">
          <span>채널: ${video.channelTitle}</span>
          <span>조회수: ${numberFormatter.format(video.viewCount)}</span>
          <span>좋아요: ${numberFormatter.format(video.likeCount)}</span>
          <span>댓글: ${numberFormatter.format(video.commentCount)}</span>
        </div>
        <div class="engagement">참여율: ${video.engagementRate.toFixed(2)}%</div>
        <a class="video-link" target="_blank" rel="noopener noreferrer"
          href="https://www.youtube.com/watch?v=${video.videoId}">영상 보러가기</a>
      </div>
    `;
    fragment.appendChild(card);
  });

  resultsContainer.appendChild(fragment);
}

function renderChart(videos) {
  const top10 = [...videos]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);

  const labels = top10.map((video) => {
    const title = video.title;
    return title.length > 28 ? `${title.slice(0, 28)}...` : title;
  });
  const values = top10.map((video) => Number(video.engagementRate.toFixed(2)));

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "참여율 (%)",
          data: values,
          backgroundColor: "rgba(108, 125, 255, 0.7)",
          borderColor: "rgba(108, 125, 255, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#edf0ff",
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#d7dcff" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#d7dcff" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(searchForm);
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const maxResults = Math.min(50, Math.max(5, Number(formData.get("maxResults") ?? 20)));

  if (!apiKey || !keyword) {
    setStatus("API 키와 검색 키워드를 모두 입력해주세요.", true);
    return;
  }

  try {
    searchBtn.disabled = true;
    setStatus("YouTube 데이터를 불러오는 중입니다...");
    resultsContainer.innerHTML = "";

    const searchItems = await searchVideos(apiKey, keyword, maxResults);
    const videoIds = searchItems
      .map((item) => item.id?.videoId)
      .filter(Boolean);

    const details = await fetchVideoDetails(apiKey, videoIds);
    const videos = details.map(toVideoViewModel);

    renderCards(videos);
    renderChart(videos);
    setStatus(`총 ${videos.length}개의 영상을 분석했습니다.`);
  } catch (error) {
    console.error(error);
    setStatus(
      "오류가 발생했습니다. API 키 권한, 할당량, 키워드를 확인해주세요.",
      true
    );
  } finally {
    searchBtn.disabled = false;
  }
});
