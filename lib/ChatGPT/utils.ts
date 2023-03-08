import { encoding_for_model } from '@dqbd/tiktoken';
import { ChatCompletionRequestMessage } from 'openai';
import { ChatMessage, MessageOutput } from './types';

const uuidv4Re =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUIDv4(str: string): boolean {
  return str !== '' && uuidv4Re.test(str);
}

// TODO: Update to GPT-3.5 when this tiktoken module has this model
const tokenizer = encoding_for_model('text-davinci-003');

export function getTokenCount(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '');
  return tokenizer.encode(input).length;
}

export function defaultSystemPrompt() {
  const currentDate = new Date().toISOString().split('T')[0];
  return `You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possiboe.\nCurrent date: ${currentDate}\n`;
}

export function formatOutput(
  chatMessage: ChatMessage,
  messages: ChatCompletionRequestMessage[]
): MessageOutput {
  const messageOutput = {
    reply: chatMessage.content,
    details: {
      id: chatMessage.id,
      role: chatMessage.role,
      openAiResponse: chatMessage.openAiResponse,
      history: messages,
    },
  };
  return messageOutput;
}