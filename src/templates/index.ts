import  { createFlow } from '@builderbot/bot'
import { mainFlow } from './mainflow';
import { faqFlow } from './faqFlow';
import { registerFlow } from './registerFlow';
import { menuFlow } from './menuFlow';
import { DetectIntention } from './intention.flow';
import { createWebPageFlow } from './createWebPageFlow';
import { subscriptionFlow } from './subscriptionFlow';

export default createFlow([
    mainFlow,
    faqFlow,
    registerFlow,
    menuFlow,
    DetectIntention,
    createWebPageFlow,
    subscriptionFlow
]);