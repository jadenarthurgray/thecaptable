export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const API_KEY = process.env.YOUTUBE_API_KEY;
  const CHANNEL_HANDLE = '@thecaptabletv';

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // First, get the channel ID from the handle
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${CHANNEL_HANDLE}&key=${API_KEY}`
    );
    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get the uploads playlist ID
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    // Get recent videos from the uploads playlist
    const playlistResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${API_KEY}`
    );
    const playlistData = await playlistResponse.json();

    if (!playlistData.items || playlistData.items.length === 0) {
      return res.status(404).json({ error: 'No videos found' });
    }

    // Get video IDs to check durations (to filter out Shorts)
    const videoIds = playlistData.items.map(item => item.snippet.resourceId.videoId).join(',');
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`
    );
    const videosData = await videosResponse.json();

    // Parse ISO 8601 duration to seconds
    function parseDuration(duration) {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || 0);
      const minutes = parseInt(match[2] || 0);
      const seconds = parseInt(match[3] || 0);
      return hours * 3600 + minutes * 60 + seconds;
    }

    // Build a set of video IDs that are longer than 60 seconds (not Shorts)
    const fullVideoIds = new Set();
    for (const video of videosData.items) {
      if (parseDuration(video.contentDetails.duration) > 60) {
        fullVideoIds.add(video.id);
      }
    }

    // Find the first non-Short video
    const fullVideo = playlistData.items.find(item => fullVideoIds.has(item.snippet.resourceId.videoId));

    if (!fullVideo) {
      return res.status(404).json({ error: 'No full-length videos found' });
    }

    const latestVideo = fullVideo.snippet;
    const videoId = latestVideo.resourceId.videoId;

    return res.status(200).json({
      videoId,
      title: latestVideo.title,
      thumbnail: latestVideo.thumbnails?.high?.url || latestVideo.thumbnails?.default?.url
    });

  } catch (error) {
    console.error('YouTube API error:', error);
    return res.status(500).json({ error: 'Failed to fetch latest video' });
  }
}
