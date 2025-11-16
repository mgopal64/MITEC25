'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  location: string;
  budget: string;
  steelRequired: string;
  dueDate: string;
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      location: '',
      budget: '',
      steelRequired: '',
      dueDate: '',
    },
  ]);

  const addProject = () => {
    setProjects([
      ...projects,
      {
        id: String(projects.length + 1),
        location: '',
        budget: '',
        steelRequired: '',
        dueDate: '',
      },
    ]);
  };

  const updateProject = (id: string, field: keyof Project, value: string) => {
    setProjects(
      projects.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSubmit = () => {
    // Validate all projects have required fields
    const validProjects = projects.filter(
      (p) => p.location && p.budget && p.steelRequired && p.dueDate
    );

    if (validProjects.length === 0) {
      alert('Please fill in at least one complete project.');
      return;
    }

    // Store projects in localStorage or pass to results page
    localStorage.setItem('projects', JSON.stringify(validProjects));
    router.push('/results');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-900 text-white font-bold">
              S
            </div>
            <span className="text-xl font-semibold text-gray-900">
              SteelAdvisory
            </span>
          </div>
          <nav className="flex gap-6">
            <a href="#" className="text-gray-600 hover:text-gray-900">
              Services
            </a>
            <a href="#" className="text-gray-600 hover:text-gray-900">
              About
            </a>
            <a href="#" className="text-gray-600 hover:text-gray-900">
              Contact
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-4xl font-bold text-gray-900">
            Optimize Your Steel Procurement
          </h1>
          <p className="text-lg text-gray-600">
            Enter your project details to get personalized sourcing
            recommendations that balance cost and sustainability.
          </p>
        </div>

        {projects.map((project, index) => (
          <div
            key={project.id}
            className="mb-6 rounded-lg bg-gray-50 p-6 shadow-sm"
          >
            <h2 className="mb-6 text-xl font-semibold text-gray-900">
              Project {index + 1}
            </h2>

            <div className="space-y-6">
              {/* Project Location */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <svg
                    className="h-5 w-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Project Location
                </label>
                <input
                  type="text"
                  placeholder="e.g., Phoenix, Arizona"
                  value={project.location}
                  onChange={(e) =>
                    updateProject(project.id, 'location', e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-4 py-2 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Where will the solar panels be installed?
                </p>
              </div>

              {/* Budget */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <svg
                    className="h-5 w-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Budget (USD)
                </label>
                <input
                  type="number"
                  placeholder="e.g., 500000"
                  value={project.budget}
                  onChange={(e) =>
                    updateProject(project.id, 'budget', e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-4 py-2 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Total budget allocated for this project's steel procurement
                </p>
              </div>

              {/* Steel Required */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <svg
                    className="h-5 w-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  Steel Required (metric tons)
                </label>
                <input
                  type="number"
                  placeholder="e.g., 1000"
                  value={project.steelRequired}
                  onChange={(e) =>
                    updateProject(project.id, 'steelRequired', e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-4 py-2 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Total amount of steel needed for this project
                </p>
              </div>

              {/* Due Date */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <svg
                    className="h-5 w-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Due Date
                </label>
                <input
                  type="date"
                  value={project.dueDate}
                  onChange={(e) =>
                    updateProject(project.id, 'dueDate', e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-4 py-2 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0"
                />
                <p className="mt-1 text-xs text-gray-500">
                  When the steel needs to be delivered (must be a future date)
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Add Another Project Button */}
        <button
          onClick={addProject}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Another Project
        </button>

        {/* Generate Recommendations Button */}
        <button
          onClick={handleSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 px-6 py-4 font-semibold text-white transition-colors hover:bg-gray-900"
        >
          Generate Recommendations
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </main>
    </div>
  );
}