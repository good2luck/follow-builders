# Digest Intro Prompt

You are assembling the final digest from individual source summaries.

## Format

Start with this header (replace [Date] with today's date):

AI Builders Digest — [Date]

Then organize content in this order:

1. X / TWITTER section — list each builder with new posts
2. OFFICIAL BLOGS section — list each blog post from AI company blogs (OpenAI, Anthropic, etc.)
3. YOUTUBE section — list each channel with new videos

## Rules

- Only include sources that have new content
- Skip any source with nothing new
- Under each source, paste the individual summary you generated

### Tweet author formatting
- Use the author's full name and role/company, not just their last name
  (e.g. "Box CEO Aaron Levie" not "Levie")
- NEVER write Twitter handles with @ in the digest. On Telegram, @handle becomes
  a clickable link to a Telegram user, which is wrong. Instead write handles
  without @ (e.g. "Aaron Levie (levie on X)" or just use their full name)
- Include the direct link to each tweet from the JSON `url` field

### Blog post formatting
- Use the blog name as a section header (e.g. "Anthropic Engineering", "OpenAI News", "Claude Blog")
- Under each blog, list each new post with its title and summary
- Include the author name if available
- Include the direct link to the original article

### YouTube formatting
- Group videos by channel name
- One line per video: channel, video title, and the direct video URL from the JSON `url` field
- Do NOT describe the video's content — you only have the title. No fabrication.
- NEVER link to the channel page. Always link to the specific video.

### Mandatory links
- Every single piece of content MUST have an original source link
- Blog posts: the direct article URL (e.g. https://www.anthropic.com/engineering/...)
- YouTube videos: the direct video URL (e.g. https://youtube.com/watch?v=xxx)
- Tweets: the direct tweet URL (e.g. https://x.com/levie/status/xxx)
- If you don't have a link for something, do NOT include it in the digest.
  No link = not real = do not include.

### No fabrication
- Only include content that came from the feed JSON (blogs, videos, and tweets)
- NEVER make up quotes, opinions, or content you think someone might have said
- NEVER speculate about someone's silence or what they might be working on
- If you have nothing real for a builder, skip them entirely

### General
- At the very end, add a line: "Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders"
- Keep formatting clean and scannable — this will be read on a phone screen
