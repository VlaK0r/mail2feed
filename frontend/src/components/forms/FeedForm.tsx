import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { feedsApi } from '../../api/feeds'
import { rulesApi } from '../../api/rules'
import type { Feed, CreateFeedRequest, UpdateFeedRequest, EmailRule } from '../../types'

interface FeedFormProps {
  feed?: Feed
  onSubmit?: (feed: Feed) => void
  onCancel?: () => void
}

export default function FeedForm({ feed, onSubmit, onCancel }: FeedFormProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<EmailRule[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const [formData, setFormData] = useState({
    title: feed?.title || '',
    description: feed?.description || '',
    link: feed?.link || '',
    email_rule_ids: feed?.email_rule_ids || [] as string[],
    feed_type: feed?.feed_type || 'rss' as 'rss' | 'atom',
    is_active: feed?.is_active ?? true,
    max_items: feed?.max_items ?? 100,
    max_age_days: feed?.max_age_days ?? 30,
    min_items: feed?.min_items ?? 10
  })

  useEffect(() => {
    const loadRules = async () => {
      try {
        const rulesData = await rulesApi.getAll()
        setRules(rulesData)
      } catch (error) {
        setErrors({ rules: 'Failed to load email rules' })
      }
    }

    loadRules()
  }, [feed])

  useEffect(() => {
    if (feed) {
      setFormData({
        title: feed.title,
        description: feed.description || '',
        link: feed.link || '',
        email_rule_ids: feed.email_rule_ids || [],
        feed_type: feed.feed_type,
        is_active: feed.is_active,
        max_items: feed.max_items ?? 100,
        max_age_days: feed.max_age_days ?? 30,
        min_items: feed.min_items ?? 10
      })
    }
  }, [feed])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Feed title is required'
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Feed description is required'
    }
    
    if (!formData.link.trim()) {
      newErrors.link = 'Feed link is required'
    } else {
      try {
        new URL(formData.link)
      } catch {
        newErrors.link = 'Feed link must be a valid URL'
      }
    }
    
    if (!formData.email_rule_ids || formData.email_rule_ids.length === 0) {
      newErrors.email_rule_ids = 'At least one email rule is required'
    }

    // Retention policy validation
    if (formData.max_items <= 0) {
      newErrors.max_items = 'Max items must be greater than 0'
    }

    if (formData.max_age_days <= 0) {
      newErrors.max_age_days = 'Max age must be greater than 0'
    }

    if (formData.min_items < 0) {
      newErrors.min_items = 'Min items cannot be negative'
    }

    if (formData.min_items > formData.max_items) {
      newErrors.min_items = 'Min items cannot exceed max items'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      let savedFeed: Feed
      
      if (feed) {
        // Update existing feed
        const updateData: UpdateFeedRequest = formData
        savedFeed = await feedsApi.update(feed.id, updateData)
      } else {
        // Create new feed
        const createData: CreateFeedRequest = formData
        savedFeed = await feedsApi.create(createData)
      }
      
      if (onSubmit) {
        onSubmit(savedFeed)
      } else {
        navigate('/feeds')
      }
    } catch (error) {
      setErrors({ 
        submit: error instanceof Error ? error.message : 'Failed to save feed' 
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      navigate('/feeds')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    
    let processedValue: string | number | boolean = value
    
    // Handle number inputs
    if (type === 'number') {
      processedValue = value === '' ? 0 : parseInt(value, 10)
    } else if (type === 'checkbox') {
      processedValue = checked
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const getSelectedRules = () => {
    return rules.filter(r => formData.email_rule_ids.includes(r.id))
  }

  const handleRuleToggle = (ruleId: string) => {
    setFormData(prev => {
      const newRuleIds = prev.email_rule_ids.includes(ruleId)
        ? prev.email_rule_ids.filter(id => id !== ruleId)
        : [...prev.email_rule_ids, ruleId]

      return { ...prev, email_rule_ids: newRuleIds }
    })

    // Clear error when user selects a rule
    if (errors.email_rule_ids) {
      setErrors(prev => ({ ...prev, email_rule_ids: '' }))
    }
  }

  const selectAllRules = () => {
    const activeRules = rules.filter(r => r.is_active)
    setFormData(prev => ({ ...prev, email_rule_ids: activeRules.map(r => r.id) }))
    if (errors.email_rule_ids) {
      setErrors(prev => ({ ...prev, email_rule_ids: '' }))
    }
  }

  const clearAllRules = () => {
    setFormData(prev => ({ ...prev, email_rule_ids: [] }))
  }

  if (rules.length === 0 && !errors.rules) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No email rules</h3>
        <p className="mt-1 text-sm text-gray-500">
          You need to create an email rule before creating feeds.
        </p>
        <div className="mt-6">
          <button
            onClick={() => navigate('/rules')}
            className="btn btn-primary"
          >
            Create Email Rule
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(errors.submit || errors.rules) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{errors.submit || errors.rules}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        {/* Feed Title */}
        <div className="sm:col-span-6">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Feed Title
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="title"
              id="title"
              value={formData.title}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.title 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="Weekly Newsletter Feed"
            />
            {errors.title && (
              <p className="mt-2 text-sm text-red-600">{errors.title}</p>
            )}
          </div>
        </div>

        {/* Feed Description */}
        <div className="sm:col-span-6">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Feed Description
          </label>
          <div className="mt-1">
            <textarea
              name="description"
              id="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.description 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="A feed containing weekly newsletter emails from our company"
            />
            {errors.description && (
              <p className="mt-2 text-sm text-red-600">{errors.description}</p>
            )}
          </div>
        </div>

        {/* Feed Link */}
        <div className="sm:col-span-6">
          <label htmlFor="link" className="block text-sm font-medium text-gray-700">
            Feed Link
          </label>
          <div className="mt-1">
            <input
              type="url"
              name="link"
              id="link"
              value={formData.link}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.link 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="https://example.com/newsletter"
            />
            <p className="mt-1 text-xs text-gray-500">
              The website or page associated with this feed
            </p>
            {errors.link && (
              <p className="mt-2 text-sm text-red-600">{errors.link}</p>
            )}
          </div>
        </div>

        {/* Email Rules - Multi-select with checkboxes */}
        <div className="sm:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Email Rules
              <span className="ml-2 text-xs text-gray-500">
                ({formData.email_rule_ids.length} selected)
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllRules}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Select All Active
              </button>
              {formData.email_rule_ids.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllRules}
                  className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div className={`mt-2 border rounded-lg p-4 max-h-64 overflow-y-auto ${
            errors.email_rule_ids
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 bg-gray-50'
          }`}>
            {rules.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No email rules available</p>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <label
                    key={rule.id}
                    className={`flex items-start p-3 rounded-lg cursor-pointer transition-colors ${
                      formData.email_rule_ids.includes(rule.id)
                        ? 'bg-primary-50 border-2 border-primary-200'
                        : 'bg-white border-2 border-gray-200 hover:border-gray-300'
                    } ${!rule.is_active ? 'opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.email_rule_ids.includes(rule.id)}
                      onChange={() => handleRuleToggle(rule.id)}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {rule.name}
                          {!rule.is_active && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-600 space-y-1">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            {rule.folder}
                          </span>
                          {rule.from_address && (
                            <span className="flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                              </svg>
                              From: {rule.from_address}
                            </span>
                          )}
                          {rule.subject_contains && (
                            <span className="flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                              Subject: "{rule.subject_contains}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {errors.email_rule_ids && (
            <p className="mt-2 text-sm text-red-600">{errors.email_rule_ids}</p>
          )}

          {formData.email_rule_ids.length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-blue-800">
                    This feed will combine emails from {formData.email_rule_ids.length} rule{formData.email_rule_ids.length !== 1 ? 's' : ''}
                  </p>
                  <p className="mt-1 text-xs text-blue-700">
                    Selected rules: {getSelectedRules().map(r => r.name).join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feed Type */}
        <div className="sm:col-span-2">
          <label htmlFor="feed_type" className="block text-sm font-medium text-gray-700">
            Feed Type
          </label>
          <div className="mt-1">
            <select
              name="feed_type"
              id="feed_type"
              value={formData.feed_type}
              onChange={handleChange}
              className="block w-full shadow-sm sm:text-sm rounded-md border-gray-300 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="rss">RSS 2.0</option>
              <option value="atom">Atom 1.0</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Both types will be available regardless of this setting
            </p>
          </div>
        </div>

        {/* Retention Policy Section */}
        <div className="sm:col-span-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Feed Retention Policy</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure how long feed items are kept and how many items to retain. These settings help manage storage and performance.
          </p>
        </div>

        {/* Max Items */}
        <div className="sm:col-span-2">
          <label htmlFor="max_items" className="block text-sm font-medium text-gray-700">
            Max Items
          </label>
          <div className="mt-1">
            <input
              type="number"
              name="max_items"
              id="max_items"
              min="1"
              value={formData.max_items}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.max_items 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum number of items to keep in the feed
            </p>
            {errors.max_items && (
              <p className="mt-2 text-sm text-red-600">{errors.max_items}</p>
            )}
          </div>
        </div>

        {/* Max Age Days */}
        <div className="sm:col-span-2">
          <label htmlFor="max_age_days" className="block text-sm font-medium text-gray-700">
            Max Age (Days)
          </label>
          <div className="mt-1">
            <input
              type="number"
              name="max_age_days"
              id="max_age_days"
              min="1"
              value={formData.max_age_days}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.max_age_days 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="30"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum age in days before items are removed
            </p>
            {errors.max_age_days && (
              <p className="mt-2 text-sm text-red-600">{errors.max_age_days}</p>
            )}
          </div>
        </div>

        {/* Min Items */}
        <div className="sm:col-span-2">
          <label htmlFor="min_items" className="block text-sm font-medium text-gray-700">
            Min Items
          </label>
          <div className="mt-1">
            <input
              type="number"
              name="min_items"
              id="min_items"
              min="0"
              value={formData.min_items}
              onChange={handleChange}
              className={`block w-full shadow-sm sm:text-sm rounded-md ${
                errors.min_items 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="10"
            />
            <p className="mt-1 text-xs text-gray-500">
              Minimum items to always keep (overrides age limit)
            </p>
            {errors.min_items && (
              <p className="mt-2 text-sm text-red-600">{errors.min_items}</p>
            )}
          </div>
        </div>

        {/* Is Active */}
        <div className="sm:col-span-6">
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              id="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
              Feed is active
            </label>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Inactive feeds will not be updated with new emails but remain accessible to readers.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={handleCancel}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {feed ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            feed ? 'Update Feed' : 'Create Feed'
          )}
        </button>
      </div>
    </form>
  )
}