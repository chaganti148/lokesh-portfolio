export const maxEntries = 20;
export const collections = {
  Projects: {
    selector: '.project-grid',
    item: 'project',
    newestFirst: false,
    columns: {
      name: { label: 'Project name', required: true, max: 800 },
      category: { label: 'Category', max: 800 },
      overview: { label: 'Overview', multiline: true, max: 800 },
      highlights: { label: 'Highlights (one per line)', multiline: true, max: 1601 },
      technologies: { label: 'Technologies', max: 800 }
    },
    legacy: ['CKYC', 'CTS', 'NACH'].map(prefix => ({
      name: [prefix + ' name'],
      category: [prefix + ' category'],
      overview: [prefix + ' overview'],
      highlights: [prefix + ' detail 1', prefix + ' detail 2'],
      technologies: [prefix + ' technologies']
    }))
  },
  'Work experience': {
    selector: '#jobs',
    item: 'job',
    newestFirst: true,
    columns: {
      role: { label: 'Job title', required: true, max: 800 },
      company: { label: 'Company', required: true, max: 800 },
      dates: { label: 'Dates and location', max: 800 },
      highlights: { label: 'Highlights (one per line)', multiline: true, max: 3203 }
    },
    legacy: [{
      role: ['Experience role'],
      company: ['Employer'],
      dates: ['Employment dates'],
      highlights: ['Experience highlight 1', 'Experience highlight 2', 'Experience highlight 3', 'Experience highlight 4']
    }]
  }
};