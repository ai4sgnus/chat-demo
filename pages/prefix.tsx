import Head from 'next/head';
import ComplexForm from '../components/ComplexForm';

export default function Home() {
  return (
    <>
      <Head>
        <title>Prefix Prompt Chatting!</title>
        <meta name="description" content="Chat" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ComplexForm />
    </>
  );
}
