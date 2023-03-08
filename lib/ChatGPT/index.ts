import Keyv from 'keyv';
import {
  Configuration,
  OpenAIApi,
  CreateChatCompletionRequest,
  ChatCompletionRequestMessage,
} from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  ChatMessage,
  GetMessageByIdFunction,
  MessageInputOptions,
  MessageOutput,
  UpsertMessageFunction,
} from './types';

import { defaultSystemPrompt, formatOutput, getTokenCount } from './utils';

const CHATGPT_MODEL = 'gpt-3.5-turbo';
const USER_LABEL_DEFAULT = 'User';
const ASSISTANT_LABEL_DEFAULT = 'ChatGPT';

export class ChatGPTAPI {
  protected _debug: boolean;

  protected _systemMessage: string;
  protected _openaiParams: Omit<CreateChatCompletionRequest, 'messages' | 'n'>;
  protected _maxModelTokens: number;
  protected _maxResponseTokens: number;

  protected _getMessageById: GetMessageByIdFunction;
  protected _upsertMessage: UpsertMessageFunction;

  protected _messageStore: Keyv<ChatMessage>;
  protected _openai: OpenAIApi;

  /**
   * Creates a new client wrapper around OpenAI's chat API
   *
   * @param apiKey - OpenAI API key (required).
   * @param debug - Optional enables logging debugging info to stdout.
   * @param openaiParams - Param overrides to send to the [OpenAI chat API](https://platform.openai.com/docs/api-reference/chat/create). Options like `temperature` and `presence_penalty` can be tweaked to change the personality of the assistant.
   * @param maxModelTokens - Optional override for the maximum number of tokens allowed by the model's context. Defaults to 4096.
   * @param maxResponseTokens - Optional override for the minimum number of tokens allowed for the model's response. Defaults to 1000.
   * @param messageStore - Optional [Keyv](https://github.com/jaredwray/keyv) store to persist chat messages to. If not provided, messages will be lost when the process exits.
   * @param getMessageById - Optional function to retrieve a message by its ID. If not provided, the default implementation will be used (using an in-memory `messageStore`).
   * @param upsertMessage - Optional function to insert or update a message. If not provided, the default implementation will be used (using an in-memory `messageStore`).
   */
  constructor(opts: {
    apiKey: string;
    systemMessage?: string;
    openaiParams?: Partial<Omit<CreateChatCompletionRequest, 'messages' | 'n'>>;

    /** @defaultValue `false` **/
    debug?: boolean;

    /** @defaultValue `4096` **/
    maxModelTokens?: number;

    /** @defaultValue `1000` **/
    maxResponseTokens?: number;

    messageStore?: Keyv;
    getMessageById?: GetMessageByIdFunction;
    upsertMessage?: UpsertMessageFunction;
  }) {
    if (!opts.apiKey) {
      throw new Error('OpenAI missing required apiKey');
    }
    this._debug = opts.debug || false;

    this._openaiParams = {
      model: CHATGPT_MODEL,
      ...opts.openaiParams,
    };

    this._systemMessage = opts.systemMessage || defaultSystemPrompt();
    this._maxModelTokens = opts.maxModelTokens || 4096;
    this._maxResponseTokens = opts.maxResponseTokens || 1000;

    this._getMessageById = opts.getMessageById || this._defaultGetMessageById;
    this._upsertMessage = opts.upsertMessage || this._defaultUpsertMessage;

    if (opts.messageStore) {
      this._messageStore = opts.messageStore;
    } else {
      this._messageStore = new Keyv();
    }

    this._openai = new OpenAIApi(new Configuration({ apiKey: opts.apiKey }));
  }

  /**
   * Sends a message to the OpenAI chat completions endpoint, waits for the response
   * to resolve, and returns the response.
   *
   * If you want your response to have historical context, you must provide a valid `parentMessageId`.
   *
   * Set `debug: true` in the `ChatGPTAPI` constructor to log more info on the full prompt sent to the OpenAI chat completions API. You can override the `systemMessage` in `opts` to customize the assistant's instructions.
   *
   * @param content - The prompt message to send
   * @param opts.parentMessageId - Optional ID of the previous message in the conversation (defaults to `undefined`)
   * @param opts.messageId - Optional ID of the message to send (defaults to a random UUID)
   * @param opts.systemMessage - Optional override for the chat "system message" which acts as instructions to the model (defaults to the ChatGPT system message)
   *
   * @returns The response from ChatGPT
   */
  async sendMessage(
    content: string,
    opts: MessageInputOptions = {}
  ): Promise<MessageOutput> {
    if (opts.prefixPrompt) {
      const messageId = uuidv4();
      const message: ChatMessage = {
        role: 'user', // TODO: decide on system or user, at the moment the docs says model listens to user more
        id: messageId,
        parentMessageId: opts.parentMessageId,
        content: opts.prefixPrompt,
      };
      opts.parentMessageId = messageId; // mutate opts
      await this._upsertMessage(message);
    }

    const messageId = uuidv4();
    const message: ChatMessage = {
      role: 'user',
      id: messageId,
      parentMessageId: opts.parentMessageId,
      content,
    };
    await this._upsertMessage(message);

    const { messages, maxTokens, numTokens } = await this._buildMessages(
      content,
      opts
    );

    if (this._debug) {
      console.log(messages);
      console.log(`sendMessage (${numTokens} tokens)`);
    }

    try {
      let openaiParams = this._openaiParams;
      if (opts.openaiParams) {
        // merge opts.openaiParams into the default this._openaiParams for this request
        openaiParams = {
          ...this._openaiParams,
          ...opts.openaiParams,
        };
      }
      const chatRequest = {
        max_tokens: maxTokens,
        ...openaiParams,
        messages,
      };
      const response = await this._openai.createChatCompletion(chatRequest);
      if (!response.data) {
        throw new Error('OpenAI request failed!');
      }

      const result: ChatMessage = {
        parentMessageId: messageId,
        id: response.data.id || uuidv4(),
        content: response.data.choices?.[0]?.message?.content || '',
        role: response.data.choices?.[0]?.message?.role || 'assistant',
        openAiResponse: response.data,
      };

      this._upsertMessage(result);
      return formatOutput(result, messages);
    } catch (err) {
      throw err;
    }
  }

  protected async _buildMessages(content: string, opts: MessageInputOptions) {
    const { systemMessage = this._systemMessage } = opts;
    let { parentMessageId } = opts;

    const userLabel = USER_LABEL_DEFAULT;
    const assistantLabel = ASSISTANT_LABEL_DEFAULT;

    const maxNumTokens = this._maxModelTokens - this._maxResponseTokens;
    let messages: ChatCompletionRequestMessage[] = [];

    if (systemMessage && systemMessage !== defaultSystemPrompt()) {
      // ignore default system message
      messages.push({
        role: 'system',
        content: systemMessage,
      });
    }

    const systemMessageOffset = messages.length;

    let nextMessages = messages.concat([
      {
        ...{
          role: 'user',
          content: content,
        },
      },
    ]);

    let numTokens = 0;

    do {
      const prompt: string = nextMessages.reduce((prompt, message) => {
        switch (message.role) {
          case 'system':
            return `${prompt}\nInstructions:\n${message.content}`;
          case 'user':
            return `${prompt}\n${userLabel}:\n${message.content}`;
          default:
            return `${prompt}\n${assistantLabel}:\n${message.content}`;
        }
      }, '');

      const nextNumTokensEstimate = await getTokenCount(prompt);
      const isValidPrompt = nextNumTokensEstimate <= maxNumTokens;

      if (prompt && !isValidPrompt) {
        break;
      }

      messages = nextMessages;
      numTokens = nextNumTokensEstimate;

      if (!isValidPrompt) {
        break;
      }

      if (!parentMessageId) {
        break;
      }

      if (opts.forget) {
        break;
      }

      const parentMessage = await this._getMessageById(parentMessageId);
      if (!parentMessage) {
        break;
      }

      nextMessages = nextMessages.slice(0, systemMessageOffset).concat([
        {
          ...{
            role: parentMessage.role || 'user',
            content: parentMessage.content,
          },
        },
        ...nextMessages.slice(systemMessageOffset),
      ]);

      parentMessageId = parentMessage.parentMessageId;
    } while (true);

    // Use up to 4096 tokens (prompt + response), but try to leave 1000 tokens
    // for the response.
    const maxTokens = Math.max(
      1,
      Math.min(this._maxModelTokens - numTokens, this._maxResponseTokens)
    );

    return { messages, maxTokens, numTokens };
  }

  protected async _defaultGetMessageById(
    id: string
  ): Promise<ChatMessage | undefined> {
    const res = await this._messageStore.get(id);
    return res;
  }

  protected async _defaultUpsertMessage(message: ChatMessage): Promise<void> {
    await this._messageStore.set(message.id, message);
  }
}
