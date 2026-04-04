import { Platform } from 'react-native';

const GROQ_TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_LANGUAGE = 'vi';
const DEFAULT_RESPONSE_FORMAT = 'json';

type GroqTranscriptionResponse = {
  text?: string;
  error?: {
    message?: string;
    type?: string;
  };
};

export type SpeechTranscriptionOptions = {
  model?: 'whisper-large-v3' | 'whisper-large-v3-turbo';
  language?: string;
  responseFormat?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
};

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  caf: 'audio/x-caf',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

const getGroqApiKey = () => {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_GROQ_API_KEY. Add it to .env and restart Expo.'
    );
  }

  return apiKey;
};

const getAudioFileMeta = (audioUri: string) => {
  const sanitizedUri = audioUri.split('?')[0] ?? audioUri;
  const fromUri = sanitizedUri.split('/').pop()?.trim() ?? '';

  let fileName = fromUri || `recording-${Date.now()}.m4a`;
  let extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';

  if (!extension) {
    extension = 'm4a';
    fileName = `${fileName}.m4a`;
  }

  const mimeType = AUDIO_MIME_BY_EXTENSION[extension] ?? 'audio/m4a';

  return {
    fileName,
    mimeType,
  };
};

const appendAudioFile = async (formData: FormData, audioUri: string) => {
  const normalizedUri = String(audioUri ?? '').trim();
  if (!normalizedUri) {
    throw new Error('audioUri is required for speech transcription.');
  }

  const { fileName, mimeType } = getAudioFileMeta(normalizedUri);

  if (Platform.OS === 'web') {
    const response = await fetch(normalizedUri);
    if (!response.ok) {
      throw new Error(`Unable to read recorded audio (status ${response.status}).`);
    }

    const blob = await response.blob();
    formData.append('file', blob, fileName);
    return;
  }

  formData.append('file', {
    uri: normalizedUri,
    name: fileName,
    type: mimeType,
  } as any);
};

export async function transcribeAudioUri(
  audioUri: string,
  options: SpeechTranscriptionOptions = {}
): Promise<string> {
  const apiKey = getGroqApiKey();

  const formData = new FormData();
  await appendAudioFile(formData, audioUri);
  formData.append('model', options.model ?? DEFAULT_MODEL);
  formData.append('language', options.language ?? DEFAULT_LANGUAGE);
  formData.append('response_format', options.responseFormat ?? DEFAULT_RESPONSE_FORMAT);

  const response = await fetch(GROQ_TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  let data: GroqTranscriptionResponse | null = null;
  try {
    data = (await response.json()) as GroqTranscriptionResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq transcription request failed (status ${response.status}).`);
  }

  if (data?.error?.message) {
    throw new Error(data.error.message);
  }

  const transcript = String(data?.text ?? '').trim();

  return transcript;
}
