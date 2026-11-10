import React from 'react';
import { Track } from '../../../content/shared/types';
import MockInterview from '../interview/MockInterview';
import { LLD_INTERVIEW_KIT } from './interviewKit';

/** #system-design/lld/interview/<slug> */
const LldMockInterview: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => <MockInterview track={track} slug={slug} kit={LLD_INTERVIEW_KIT} />;

export default LldMockInterview;
