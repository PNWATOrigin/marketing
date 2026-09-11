import sys
import json
import asyncio
import edge_tts

# 무료 TTS(edge-tts, Microsoft Edge 음성 API)로 나레이션 음성을 만들고, 단어별 타이밍
# (WordBoundary)도 함께 받아 표준출력으로 내보낸다. storyboard.js가 이 타이밍으로
# 장면을 자동 구성하므로, 오디오 파일 저장과 타이밍 수집을 한 번의 스트림에서 같이 한다.
async def main():
    voice = sys.argv[1]
    output_path = sys.argv[2]
    text = sys.stdin.read().strip()
    if not text:
        sys.exit(1)
    communicate = edge_tts.Communicate(text, voice)
    words = []
    with open(output_path, 'wb') as f:
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio':
                f.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                start = chunk['offset'] / 1e7
                dur = chunk['duration'] / 1e7
                words.append({'start': round(start, 3), 'end': round(start + dur, 3), 'text': chunk['text']})
    if not words:
        sys.exit(1)
    print(json.dumps({'words': words}, ensure_ascii=False))

asyncio.run(main())
