// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { ChatGPTAPI } from '../../lib/ChatGPT';
import { MessageInputOptions, MessageOutput } from '@/lib/ChatGPT/types';
require('dotenv-safe').config();

type Data = any;

let messageStore = new Keyv();

if (process.env.REDIS_URL) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const store = new KeyvRedis(redisUrl);
  messageStore = new Keyv({ store, namespace: 'chatgpt-demo' });
  console.log('Using Redis to store message context');
}

const api = new ChatGPTAPI({
  apiKey: process.env.OPENAI_API_KEY || '',
  messageStore,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const content = req.body?.message;
  const options: MessageInputOptions = req.body?.options || {};
  try {
    const messageOutput: MessageOutput = await api.sendMessage(
      content,
      options
    );
    res.status(200).json({
      version: 'v1',
      content: {
        messages: [
          {
            type: 'text',
            text: messageOutput.reply,
          },
        ],
      },
    });
  } catch (e) {
    // console.error(e);
    console.log('Received request', req.body);
    res.status(500).json({
      version: 'v1',
      content: {
        messages: [
          {
            type: 'text',
            text: 'Something went wrong',
          },
        ],
      },
    });
  }
}
