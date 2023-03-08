import Head from 'next/head';
import Form from '../components/Form';

export default function Home() {
  return (
    <>
      <Head>
        <title>Just Chatting!</title>
        <meta name="description" content="Chat" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Form />
    </>
  );
}
