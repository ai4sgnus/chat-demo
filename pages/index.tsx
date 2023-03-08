import { Button, Stack } from '@chakra-ui/react';
import Head from 'next/head';
import { Center } from '@chakra-ui/react';
import NextLink from 'next/link';
export default function Home() {
  return (
    <>
      <Head>
        <title>Chat Demo Home</title>
        <meta name="description" content="Chat" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Center h="container.md" color="white">
        <Stack direction="row" spacing={4} align="center">
          <Button colorScheme="teal" variant="solid" as={NextLink} href="/chat">
            Just Chatting
          </Button>
          <Button
            colorScheme="teal"
            variant="outline"
            as={NextLink}
            href="/prefix"
          >
            + Prefix Prompt
          </Button>
        </Stack>
      </Center>
    </>
  );
}
