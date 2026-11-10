import React from 'react';
import { Track } from '../../../content/shared/types';
import MockInterview from '../interview/MockInterview';
import { HLD_INTERVIEW_KIT } from './interviewKit';

/** #system-design/hld/interview/<slug> */
const HldMockInterview: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => <MockInterview track={track} slug={slug} kit={HLD_INTERVIEW_KIT} />;

export default HldMockInterview;
