/** Public learning scenario; does not create, reset or mutate an expedition. */
export const USER_SCENARIO=Object.freeze({
 title:'Does adding water always help?',
 promise:'Learn to choose a controlled experiment and explain what its result can—and cannot—tell you.',
 audience:'Curious players and people learning how agents choose experiments.',
 recordedWalkthrough:'/replay?view=text',freeExpedition:'/',comparison:'/learn#comparison',
 steps:[
  {title:'Make your prediction',action:'Read the recorded first observation: growth is 50/100 without water. Predict what will happen if only water changes.',benefit:'Notice the assumption you are making before seeing the answer.'},
  {title:'Check the evidence',action:'Follow the original IMD proposal and reveal the measurement. Growth stays at 50/100; five explanations are ruled out.',benefit:'A result can reduce uncertainty even when the plant does not survive.'},
  {title:'Choose the next question',action:'Ask whether the water response changes with a different mineral or light. A matched pair should change only the factor you want to test.',benefit:'A single contrast cannot settle every interaction or establish a universal law.'},
 ],
 transfer:{title:'Try it in your own free world',action:'Open the island, start or continue a local expedition, and inspect its journal. Use Your experiment to choose a test. When one model remains, test its four held-out predictions and reveal the committed configuration.',savedWorld:'If your previous world is complete, New expedition offers a separate new world. The recorded IMD archive is never reset by this guide.',cost:'40 internal game credits; 2 per training experiment. No wallet or IMD tokens are needed for local play.',limit:'A new local world has different hidden rules. Its results are not a continuation or repetition of the historical IMD request.'},
 builder:{title:'For agent builders',action:'Inspect the public observation → proposal → measurement boundary. Compare a controlled hypothesis test with selectors that already know the candidate family; then use the public engine to evaluate your own experiment policy.',limit:'This is a small synthetic testbed, not evidence of real-world scientific discovery or a general AI benchmark.'},
});
