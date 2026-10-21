export default async function expectToRejectWithMessage(
  promise: Promise<unknown>,
  message: string | RegExp
): Promise<void> {
  // $FlowFixMe
  await expect(promise).rejects.toMatchObject({
    // $FlowFixMe
    message: expect.stringMatching(message),
  })
}