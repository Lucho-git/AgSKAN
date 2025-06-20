// src/lib/api/surveyApi.ts - Enhanced logging version
import { supabase } from "$lib/stores/sessionStore"

interface SurveyAnswers {
    referralSource: string
    otherReferralSource?: string
    role: string
    otherRole?: string
    hectares: string
    devicePreference: string
    featureInterests: string[]
    pathRecreateInterest: string
    pathOptimizationInterest: string
    enterpriseGoals: string[]
    technologyInterest: number
}

export const surveyApi = {
    async loadSurveyData(profileId: string) {
        try {
            console.log('🔍 Loading survey data for profile:', profileId)

            const { data, error } = await supabase
                .from('survey_data')
                .select('survey_data, completed_at')
                .eq('profile_id', profileId)
                .maybeSingle()

            if (error) {
                console.error('❌ Supabase error:', error)
                throw error
            }

            console.log('📊 Raw survey data from DB:', data)

            if (!data) {
                console.log('✨ No existing survey data found - this is a new user')
                return { answers: {}, hasExistingData: false, wasCompleted: false }
            }

            if (!data.survey_data?.questions) {
                console.log('⚠️ Survey data exists but has no questions structure')
                return { answers: {}, hasExistingData: false, wasCompleted: false }
            }

            // Extract answers from the stored format
            const questions = data.survey_data.questions
            const answers: Partial<SurveyAnswers> = {}

            console.log('🔧 Processing questions from DB:', questions)

            // Map stored format back to component format
            Object.entries(questions).forEach(([key, value]: [string, any]) => {

                switch (key) {
                    case 'referral_source':
                        answers.referralSource = value.answer
                        break
                    case 'referral_source_other':
                        answers.otherReferralSource = value.answer
                        break
                    case 'role':
                        answers.role = value.answer
                        break
                    case 'role_other':
                        answers.otherRole = value.answer
                        break
                    case 'hectares':
                        answers.hectares = value.answer
                        break
                    case 'device_preference':
                        answers.devicePreference = value.answer
                        break
                    case 'feature_interests':
                        answers.featureInterests = value.answer || []
                        break
                    case 'path_recreate_interest':
                        answers.pathRecreateInterest = value.answer
                        break
                    case 'path_optimization_interest':
                        answers.pathOptimizationInterest = value.answer
                        break
                    case 'enterprise_goals':
                        answers.enterpriseGoals = value.answer || []
                        break
                    case 'technology_interest':
                        answers.technologyInterest = value.answer
                        break
                }
            })

            console.log('✅ Processed answers:', answers)

            return {
                answers,
                hasExistingData: true,
                wasCompleted: !!data.completed_at
            }
        } catch (error) {
            console.error('💥 Error loading survey data:', error)
            return { answers: {}, hasExistingData: false, wasCompleted: false }
        }
    },

    async saveSurveyData(profileId: string, surveyAnswers: SurveyAnswers) {
        try {
            console.log('💾 Saving survey data for profile:', profileId)
            console.log('📝 Survey answers to save:', surveyAnswers)

            // Build the survey data structure
            const surveyData = {
                questions: {
                    referral_source: {
                        question: "How did you hear about us?",
                        answer: surveyAnswers.referralSource
                    },
                    ...(surveyAnswers.otherReferralSource && {
                        referral_source_other: {
                            question: "Please specify how you heard about us",
                            answer: surveyAnswers.otherReferralSource
                        }
                    }),
                    role: {
                        question: "What is your role in the operation?",
                        answer: surveyAnswers.role
                    },
                    ...(surveyAnswers.otherRole && {
                        role_other: {
                            question: "Please specify your role",
                            answer: surveyAnswers.otherRole
                        }
                    }),
                    hectares: {
                        question: "How many hectares do you work over?",
                        answer: surveyAnswers.hectares
                    },
                    device_preference: {
                        question: "Which device(s) would you prefer to run our software on?",
                        answer: surveyAnswers.devicePreference
                    },
                    feature_interests: {
                        question: "Which of our features are you most interested in?",
                        answer: surveyAnswers.featureInterests
                    },
                    path_recreate_interest: {
                        question: "Rate your interest in Path Recreate feature",
                        answer: surveyAnswers.pathRecreateInterest
                    },
                    path_optimization_interest: {
                        question: "Rate your interest in Path Optimization feature",
                        answer: surveyAnswers.pathOptimizationInterest
                    },
                    enterprise_goals: {
                        question: "What are the primary goals of your enterprise in the next 5 years?",
                        answer: surveyAnswers.enterpriseGoals
                    },
                    technology_interest: {
                        question: "How interested are you in adopting new technologies to increase productivity?",
                        answer: surveyAnswers.technologyInterest
                    }
                }
            }

            console.log('🏗️ Built survey data structure:', surveyData)

            // Use upsert with the proper conflict resolution
            const { data: result, error } = await supabase
                .from('survey_data')
                .upsert({
                    profile_id: profileId,
                    survey_data: surveyData,
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'profile_id' // This tells Supabase which field to use for conflict resolution
                })

            if (error) {
                console.error('❌ Supabase save error:', error)
                throw error
            }

            console.log('✅ Survey data saved successfully:', result)
            return { success: true }
        } catch (error) {
            console.error('💥 Error saving survey data:', error)
            return { success: false, error: error.message }
        }
    }
}